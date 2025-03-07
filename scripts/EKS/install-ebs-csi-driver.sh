#!/bin/bash

curl -sSL -o ebs-csi-policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-ebs-csi-driver/master/docs/example-iam-policy.json

aws iam create-policy \
 --policy-name $AWS_EKS_CLUSTER-ebs-csi \
 --policy-document file://ebs-csi-policy.json

eksctl create iamserviceaccount \
--cluster=$AWS_EKS_CLUSTER \
--namespace=kube-system \
--name=ebs-csi-controller \
--role-name=$AWS_EKS_CLUSTER-ebs-csi-controller \
--attach-policy-arn=arn:aws:iam::$AWS_ACCOUNT_ID:policy/$AWS_EKS_CLUSTER-ebs-csi \
--override-existing-serviceaccounts \
--region $AWS_REGION \
--approve

helm repo add aws-ebs-csi-driver https://kubernetes-sigs.github.io/aws-ebs-csi-driver
helm repo update

helm upgrade --install aws-ebs-csi-driver \
  --namespace kube-system \
  --set controller.serviceAccount.create=false \
  --set controller.serviceAccount.name=ebs-csi-controller \
  aws-ebs-csi-driver/aws-ebs-csi-driver

kubectl delete storageclass gp2

cat <<EOF >>gp2-storage-class.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp2
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
parameters:
  type: gp2
  fsType: ext4
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
EOF

kubectl apply -f gp2-storage-class.yaml

cat <<EOF >>gp3-storage-class.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  fsType: ext4
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
EOF

kubectl apply -f gp3-storage-class.yaml