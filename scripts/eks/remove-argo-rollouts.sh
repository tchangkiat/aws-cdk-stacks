kubectl delete -f argo-rollouts-example.yaml
rm argo-rollouts-example.yaml

kubectl delete -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml
kubectl delete namespace argo-rollouts