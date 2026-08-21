package builder

import (
	"fmt"
	"log/slog"
	"os"
	"strconv"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// Config holds builder service configuration.
type Config struct {
	Namespace                  string
	KanikoImage                string
	Registry                   string
	JobTTLSecondsAfterFinished int32
}

// DefaultConfig returns Config from environment variables.
func DefaultConfig() Config {
	ttl := int32(3600)
	if v := os.Getenv("JOB_TTL_SECONDS_AFTER_FINISHED"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			ttl = int32(n)
		}
	}
	ns := os.Getenv("NAMESPACE")
	if ns == "" {
		ns = "default"
	}
	kanikoImg := os.Getenv("KANIKO_IMAGE")
	if kanikoImg == "" {
		kanikoImg = "gcr.io/kaniko-project/executor:latest"
	}
	registry := os.Getenv("REGISTRY")
	if registry == "" {
		registry = "registry:5000"
	}
	return Config{
		Namespace:                  ns,
		KanikoImage:                kanikoImg,
		Registry:                   registry,
		JobTTLSecondsAfterFinished: ttl,
	}
}

// NewK8sClient returns a Kubernetes clientset, preferring in-cluster config.
func NewK8sClient() (*kubernetes.Clientset, error) {
	cfg, err := rest.InClusterConfig()
	if err != nil {
		slog.Warn("not in cluster, falling back to kubeconfig", "err", err)
		cfg, err = clientcmd.BuildConfigFromFlags("", clientcmd.RecommendedHomeFile)
		if err != nil {
			return nil, fmt.Errorf("k8s client config: %w", err)
		}
	}
	return kubernetes.NewForConfig(cfg)
}

// buildContextHostPath is where build contexts live on the node's local
// disk. Both the builder Deployment and every Kaniko Job mount this same
// host directory, mirroring how CI builds already work on this single-node
// cluster (the runner's build-agent sidecar and its Kaniko pods share
// node-local storage rather than a PersistentVolumeClaim). Nothing here
// needs to survive past the build, so plain node-local scratch space is
// sufficient — no PVC/StorageClass/shared-volume plumbing required.
const buildContextHostPath = "/var/lib/labbrly-builder-context"

var hostPathDirectoryOrCreate = corev1.HostPathDirectoryOrCreate

// CreateKanikoJob submits a Kaniko batch job to Kubernetes and returns the job name.
func CreateKanikoJob(k8s *kubernetes.Clientset, cfg Config, jobID, imageDestination string) (string, error) {
	jobName := "kaniko-build-" + jobID[:8]
	ttl := cfg.JobTTLSecondsAfterFinished
	backoff := int32(1)

	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      jobName,
			Namespace: cfg.Namespace,
		},
		Spec: batchv1.JobSpec{
			BackoffLimit:            &backoff,
			TTLSecondsAfterFinished: &ttl,
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{"job-name": jobName},
				},
				Spec: corev1.PodSpec{
					RestartPolicy: corev1.RestartPolicyNever,
					Containers: []corev1.Container{
						{
							Name:  "kaniko",
							Image: cfg.KanikoImage,
							Args: []string{
								fmt.Sprintf("--context=/context/%s", jobID),
								fmt.Sprintf("--dockerfile=/context/%s/Dockerfile", jobID),
								fmt.Sprintf("--destination=%s", imageDestination),
								"--insecure", // local registry runs plain HTTP
								"--verbosity=info",
							},
							VolumeMounts: []corev1.VolumeMount{
								{Name: "build-context", MountPath: "/context"},
							},
						},
					},
					Volumes: []corev1.Volume{
						{
							Name: "build-context",
							VolumeSource: corev1.VolumeSource{
								HostPath: &corev1.HostPathVolumeSource{
									Path: buildContextHostPath,
									Type: &hostPathDirectoryOrCreate,
								},
							},
						},
					},
				},
			},
		},
	}

	ctx := contextBackground()
	_, err := k8s.BatchV1().Jobs(cfg.Namespace).Create(ctx, job, metav1.CreateOptions{})
	if err != nil {
		return "", fmt.Errorf("create kaniko job: %w", err)
	}
	return jobName, nil
}

// JobStatus returns the active/succeeded/failed counts for a job.
type JobStatus struct {
	Job       string `json:"job"`
	Active    int32  `json:"active"`
	Succeeded int32  `json:"succeeded"`
	Failed    int32  `json:"failed"`
}

// GetJobStatus reads the current status of a K8s Job.
func GetJobStatus(k8s *kubernetes.Clientset, cfg Config, jobName string) (*JobStatus, error) {
	ctx := contextBackground()
	job, err := k8s.BatchV1().Jobs(cfg.Namespace).Get(ctx, jobName, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	return &JobStatus{
		Job:       jobName,
		Active:    job.Status.Active,
		Succeeded: job.Status.Succeeded,
		Failed:    job.Status.Failed,
	}, nil
}
