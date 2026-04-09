// Package billing implements the overage metering loop for labbrly.
//
// Design: two goroutines share a mutex-protected accumulator.
//
//   - sampleLoop ticks every sampleInterval (60 s). It scans Redis for
//     active pods, computes per-namespace overage units, and adds them to
//     the accumulator. Thirty samples per 30-minute block means a lab that
//     runs for 15 minutes is charged for roughly half a block — far more
//     accurate than the previous end-of-block snapshot approach.
//
//   - blockLoop wakes at each 30-minute UTC boundary. It atomically drains
//     the accumulator, then fans out Stripe MeterEvent calls (bounded to
//     maxWorkers goroutines). The Stripe call carries an idempotency
//     Identifier (<namespace>:<block_end>) so duplicate submissions are
//     harmless. Redis is marked billed only after a successful Stripe call.
package billing

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"sync"
	"time"

	mongoClient "github.com/labbrly/billing/internal/mongo"
	redisClient "github.com/labbrly/billing/internal/redis"
	stripe "github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/billing/meterevent"
)

const (
	BlockDuration    = 30 * time.Minute
	SampleInterval   = 60 * time.Second
	IdempotencyTTL   = 48 * time.Hour
	FreeConcurrency  = 10
	maxWorkers       = 20
	stripeMaxRetries = 3
)

var sizeWeight = map[string]int{
	"small":  1,
	"medium": 2,
	"large":  3,
}

var filteredNamespaces = map[string]bool{
	"default":       true,
	"kube-system":   true,
	"kube-public":   true,
	"ingress-nginx": true,
}

// Lab is the subset of a Redis pod record used for billing.
type lab struct {
	EnvSize string `json:"env_size"`
}

func labWeight(l lab) int {
	if w, ok := sizeWeight[l.EnvSize]; ok {
		return w
	}
	return 1 // unknown sizes treated as small
}

// Service runs the two metering loops and owns the in-memory accumulator.
type Service struct {
	redis *redisClient.Client
	mongo *mongoClient.Client

	mu          sync.Mutex
	accumulator map[string]int // namespace -> accumulated overage units
}

// New returns a Service wired to the given clients.
func New(r *redisClient.Client, m *mongoClient.Client) *Service {
	return &Service{
		redis:       r,
		mongo:       m,
		accumulator: make(map[string]int),
	}
}

// Run starts the sample and block-flush loops. Blocks until ctx is cancelled.
func (s *Service) Run(ctx context.Context) {
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); s.runSampleLoop(ctx) }()
	go func() { defer wg.Done(); s.runBlockLoop(ctx) }()
	wg.Wait()
}

// runSampleLoop ticks every SampleInterval and accumulates overage units.
func (s *Service) runSampleLoop(ctx context.Context) {
	ticker := time.NewTicker(SampleInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.sample(ctx)
		}
	}
}

// runBlockLoop wakes at each block boundary and flushes accumulated units to Stripe.
func (s *Service) runBlockLoop(ctx context.Context) {
	now := time.Now()
	nextBoundary := now.Truncate(BlockDuration).Add(BlockDuration)
	initialSleep := time.Until(nextBoundary)
	slog.Info("billing: waiting for first block boundary",
		"next_boundary", nextBoundary.UTC().Format(time.RFC3339),
		"sleep", initialSleep.Round(time.Second),
	)

	select {
	case <-ctx.Done():
		return
	case <-time.After(initialSleep):
	}

	s.flushBlock(ctx, time.Now().Truncate(BlockDuration).Unix())

	ticker := time.NewTicker(BlockDuration)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case t := <-ticker.C:
			s.flushBlock(ctx, t.Truncate(BlockDuration).Unix())
		}
	}
}

// sample takes one measurement across all namespaces and adds to the accumulator.
func (s *Service) sample(ctx context.Context) {
	namespaces, err := s.listNamespaces(ctx)
	if err != nil {
		slog.Error("billing: sample: list namespaces failed", "err", err)
		return
	}

	type result struct {
		ns    string
		units int
	}
	results := make(chan result, len(namespaces))
	sem := make(chan struct{}, maxWorkers)
	var wg sync.WaitGroup

	for _, ns := range namespaces {
		wg.Add(1)
		sem <- struct{}{}
		go func(ns string) {
			defer wg.Done()
			defer func() { <-sem }()
			labs, err := s.fetchLabs(ctx, ns)
			if err != nil {
				slog.Error("billing: sample: fetch labs failed", "namespace", ns, "err", err)
				return
			}
			units := computeOverageUnits(labs)
			results <- result{ns: ns, units: units}
		}(ns)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	var withOverage int
	s.mu.Lock()
	for r := range results {
		if r.units > 0 {
			s.accumulator[r.ns] += r.units
			withOverage++
		}
	}
	s.mu.Unlock()

	slog.Info("billing: sample complete",
		"namespaces_scanned", len(namespaces),
		"namespaces_with_overage", withOverage,
	)
}

// flushBlock atomically drains the accumulator and reports each namespace to Stripe.
func (s *Service) flushBlock(ctx context.Context, blockEnd int64) {
	s.mu.Lock()
	snapshot := s.accumulator
	s.accumulator = make(map[string]int)
	s.mu.Unlock()

	slog.Info("billing: flushing block", "block_end", blockEnd, "namespaces", len(snapshot))

	sem := make(chan struct{}, maxWorkers)
	var wg sync.WaitGroup

	for ns, units := range snapshot {
		if units <= 0 {
			continue
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(ns string, units int) {
			defer wg.Done()
			defer func() { <-sem }()
			if err := s.reportToStripe(ctx, ns, units, blockEnd); err != nil {
				slog.Error("billing: stripe report failed",
					"namespace", ns, "units", units, "err", err)
				return
			}
			// Mark billed only after Stripe succeeds. Stripe-side dedup via
			// Identifier means re-submission on restart is safe.
			if err := s.redis.SetBilled(ctx, ns, blockEnd, IdempotencyTTL); err != nil {
				slog.Warn("billing: failed to mark block billed (non-fatal)",
					"namespace", ns, "err", err)
			}
		}(ns, units)
	}

	wg.Wait()
	slog.Info("billing: block flush complete", "block_end", blockEnd)
}

// listNamespaces scans Redis for pod:* keys and extracts unique org namespaces.
func (s *Service) listNamespaces(ctx context.Context) ([]string, error) {
	seen := make(map[string]struct{})
	var cursor uint64
	for {
		keys, next, err := s.redis.Scan(ctx, cursor, "pod:*", 500)
		if err != nil {
			return nil, fmt.Errorf("redis scan: %w", err)
		}
		for _, key := range keys {
			// key format: pod:<namespace>:<pod-name>
			ns := namespaceFromKey(key)
			if ns != "" && !filteredNamespaces[ns] {
				seen[ns] = struct{}{}
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	namespaces := make([]string, 0, len(seen))
	for ns := range seen {
		namespaces = append(namespaces, ns)
	}
	return namespaces, nil
}

// fetchLabs returns all active labs for a namespace by scanning pod:<ns>:* keys.
func (s *Service) fetchLabs(ctx context.Context, ns string) ([]lab, error) {
	pattern := fmt.Sprintf("pod:%s:*", ns)
	var labs []lab
	var cursor uint64
	for {
		keys, next, err := s.redis.Scan(ctx, cursor, pattern, 500)
		if err != nil {
			return nil, fmt.Errorf("redis scan %s: %w", ns, err)
		}
		if len(keys) > 0 {
			values, err := s.redis.MGet(ctx, keys)
			if err != nil {
				return nil, fmt.Errorf("redis mget %s: %w", ns, err)
			}
			for _, raw := range values {
				if raw == "" {
					continue
				}
				var l lab
				if err := json.Unmarshal([]byte(raw), &l); err != nil {
					slog.Warn("billing: failed to parse lab JSON", "namespace", ns)
					continue
				}
				if l.EnvSize == "" {
					l.EnvSize = "small"
				}
				labs = append(labs, l)
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return labs, nil
}

// computeOverageUnits applies the free-tier policy: the FreeConcurrency smallest
// labs (by weight) are free; the rest are charged at their weight per sample.
func computeOverageUnits(labs []lab) int {
	if len(labs) <= FreeConcurrency {
		return 0
	}
	sorted := make([]lab, len(labs))
	copy(sorted, labs)
	sort.Slice(sorted, func(i, j int) bool {
		return labWeight(sorted[i]) < labWeight(sorted[j])
	})
	units := 0
	for _, l := range sorted[FreeConcurrency:] {
		units += labWeight(l)
	}
	return units
}

// reportToStripe looks up the org's Stripe customer ID and creates a MeterEvent.
// Retries up to stripeMaxRetries times with exponential backoff. The Identifier
// field (<namespace>:<block_end>) makes the call idempotent on Stripe's side.
func (s *Service) reportToStripe(ctx context.Context, ns string, units int, blockEnd int64) error {
	org, err := s.mongo.FindOrgByNamespace(ctx, ns)
	if err != nil {
		return err
	}
	if org == nil {
		slog.Warn("billing: no org found for namespace", "namespace", ns)
		return nil
	}
	if org.StripeCustomerID == "" {
		slog.Warn("billing: org has no stripe_customer_id", "namespace", ns)
		return nil
	}

	params := &stripe.BillingMeterEventParams{
		EventName: stripe.String("compute_units"),
		Payload: map[string]string{
			"value":              fmt.Sprintf("%d", units),
			"stripe_customer_id": org.StripeCustomerID,
		},
		Identifier: stripe.String(fmt.Sprintf("%s:%d", ns, blockEnd)),
	}

	var lastErr error
	for attempt := 0; attempt < stripeMaxRetries; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(1<<attempt) * time.Second
			slog.Warn("billing: retrying Stripe report",
				"namespace", ns, "attempt", attempt, "backoff", backoff)
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
		}
		event, err := meterevent.New(params)
		if err == nil {
			slog.Info("billing: reported to Stripe",
				"namespace", ns,
				"units", units,
				"block_end", blockEnd,
				"meter_event_identifier", event.Identifier,
			)
			return nil
		}
		lastErr = err
		slog.Warn("billing: Stripe error", "namespace", ns, "attempt", attempt, "err", err)
	}
	return fmt.Errorf("Stripe retries exhausted for %s: %w", ns, lastErr)
}

// namespaceFromKey extracts the namespace segment from a "pod:<ns>:<name>" key.
func namespaceFromKey(key string) string {
	// Walk the string manually to avoid an allocation from strings.SplitN.
	first := -1
	for i, c := range key {
		if c == ':' {
			if first == -1 {
				first = i
			} else {
				return key[first+1 : i]
			}
		}
	}
	return ""
}
