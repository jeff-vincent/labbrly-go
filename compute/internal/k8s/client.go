// Package k8s wraps client-go with the operations needed by the compute service.
// All Kubernetes interactions go through this package — no kubectl subprocesses.
package k8s

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"

	corev1 "k8s.io/api/core/v1"
	kerrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/remotecommand"
)

// Client wraps a kubernetes.Clientset with helpers used by the compute service.
type Client struct {
	cs  *kubernetes.Clientset
	cfg *rest.Config
}

// New returns a Client using in-cluster config when running inside a pod, or
// the local kubeconfig otherwise.
func New() (*Client, error) {
	cfg, err := inClusterOrKubeconfig()
	if err != nil {
		return nil, err
	}
	cs, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	return &Client{cs: cs, cfg: cfg}, nil
}

func inClusterOrKubeconfig() (*rest.Config, error) {
	if _, ok := os.LookupEnv("KUBERNETES_SERVICE_HOST"); ok {
		return rest.InClusterConfig()
	}
	kubeconfig := os.Getenv("KUBECONFIG")
	if kubeconfig == "" {
		kubeconfig = clientcmd.RecommendedHomeFile
	}
	return clientcmd.BuildConfigFromFlags("", kubeconfig)
}

// CreateNamespace creates a namespace, ignoring AlreadyExists.
func (c *Client) CreateNamespace(ctx context.Context, name string) error {
	ns := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: name}}
	_, err := c.cs.CoreV1().Namespaces().Create(ctx, ns, metav1.CreateOptions{})
	if kerrors.IsAlreadyExists(err) {
		return nil
	}
	return err
}

// CreatePod creates a pod in the given namespace.
func (c *Client) CreatePod(ctx context.Context, namespace string, pod *corev1.Pod) error {
	_, err := c.cs.CoreV1().Pods(namespace).Create(ctx, pod, metav1.CreateOptions{})
	return err
}

// GetPod returns the pod object for name/namespace.
func (c *Client) GetPod(ctx context.Context, namespace, name string) (*corev1.Pod, error) {
	return c.cs.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
}

// DeletePod deletes a pod. Returns nil if the pod does not exist.
func (c *Client) DeletePod(ctx context.Context, namespace, name string) error {
	err := c.cs.CoreV1().Pods(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if kerrors.IsNotFound(err) {
		return nil
	}
	return err
}

// PodPhase returns the pod's phase string, or "" if the pod doesn't exist.
func (c *Client) PodPhase(ctx context.Context, namespace, name string) (string, error) {
	pod, err := c.GetPod(ctx, namespace, name)
	if kerrors.IsNotFound(err) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return string(pod.Status.Phase), nil
}

// PodIP returns the pod's IP if it is in Running phase, or "" otherwise.
func (c *Client) PodIP(ctx context.Context, namespace, name string) (string, error) {
	pod, err := c.GetPod(ctx, namespace, name)
	if err != nil {
		return "", err
	}
	if pod.Status.Phase != corev1.PodRunning {
		return "", nil
	}
	return pod.Status.PodIP, nil
}

// ExecOptions specifies how to run a command inside a container.
type ExecOptions struct {
	Namespace string
	Pod       string
	Container string
	Command   []string
	Stdin     io.Reader
	Stdout    io.Writer
	Stderr    io.Writer
	TTY       bool
}

// Exec runs a command in a pod container via the Kubernetes exec SPDY API.
func (c *Client) Exec(ctx context.Context, opts ExecOptions) error {
	req := c.cs.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(opts.Pod).
		Namespace(opts.Namespace).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: opts.Container,
			Command:   opts.Command,
			Stdin:     opts.Stdin != nil,
			Stdout:    opts.Stdout != nil,
			Stderr:    opts.Stderr != nil,
			TTY:       opts.TTY,
		}, scheme.ParameterCodec)

	exec, err := remotecommand.NewSPDYExecutor(c.cfg, "POST", req.URL())
	if err != nil {
		return err
	}
	return exec.StreamWithContext(ctx, remotecommand.StreamOptions{
		Stdin:  opts.Stdin,
		Stdout: opts.Stdout,
		Stderr: opts.Stderr,
		Tty:    opts.TTY,
	})
}

// ExecCapture runs a command in a pod and returns stdout, stderr as byte slices.
func (c *Client) ExecCapture(ctx context.Context, namespace, pod, container string, cmd []string) ([]byte, []byte, error) {
	var stdout, stderr bytes.Buffer
	err := c.Exec(ctx, ExecOptions{
		Namespace: namespace,
		Pod:       pod,
		Container: container,
		Command:   cmd,
		Stdout:    &stdout,
		Stderr:    &stderr,
	})
	return stdout.Bytes(), stderr.Bytes(), err
}

// ContainerName returns the name of the first container in a pod spec.
func ContainerName(pod *corev1.Pod) (string, error) {
	if pod == nil || len(pod.Spec.Containers) == 0 {
		return "", errors.New("pod has no containers")
	}
	return pod.Spec.Containers[0].Name, nil
}
