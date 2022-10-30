#!/bin/bash

export EMR_S3_BUCKET=s3://emr-${AWS_EKS_CLUSTER}-${AWS_ACCOUNT_ID}-${AWS_REGION}
aws s3 rm $EMR_S3_BUCKET --recursive
aws s3 rb $EMR_S3_BUCKET --force

export VIRTUAL_CLUSTER_ID=$(aws emr-containers list-virtual-clusters --query "virtualClusters[?state=='RUNNING'].id" --output text)

for Job_id in $(aws emr-containers list-job-runs --states RUNNING --virtual-cluster-id ${VIRTUAL_CLUSTER_ID} --query "jobRuns[?state=='RUNNING'].id" --output text ); do aws emr-containers cancel-job-run --id ${Job_id} --virtual-cluster-id ${VIRTUAL_CLUSTER_ID}; done

aws emr-containers delete-virtual-cluster --id ${VIRTUAL_CLUSTER_ID}

aws iam detach-role-policy \
 --role-name $AWS_EKS_CLUSTER-emr-containers-job-execution \
 --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/$AWS_EKS_CLUSTER-emr-containers-job-execution

aws iam delete-role --role-name $AWS_EKS_CLUSTER-emr-containers-job-execution

aws iam delete-policy \
 --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/$AWS_EKS_CLUSTER-emr-containers-job-execution

rm emr-trust-policy.json
rm emr-containers-job-execution.json

eksctl delete iamidentitymapping --cluster $AWS_EKS_CLUSTER --arn arn:aws:iam::$AWS_ACCOUNT_ID:role/AWSServiceRoleForAmazonEMRContainers

kubectl delete namespace spark
