kubectl delete -f gatewayclass.yaml
rm gatewayclass.yaml

helm uninstall gateway-api-controller --namespace aws-application-networking-system

eksctl delete iamserviceaccount \
--cluster=$AWS_EKS_CLUSTER \
--name="gateway-api-controller" \
--namespace=aws-application-networking-system

kubectl delete -f gateway-api-controller-namespace.yaml
rm gateway-api-controller-namespace.yaml

aws iam delete-policy --policy-arn "arn:aws:iam::$AWS_ACCOUNT_ID:policy/${AWS_EKS_CLUSTER}-GatewayApiControllerPolicy"
