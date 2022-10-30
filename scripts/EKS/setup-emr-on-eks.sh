#!/bin/bash

kubectl create namespace spark

eksctl create iamidentitymapping --cluster $AWS_EKS_CLUSTER --namespace spark --service-name "emr-containers"

cat <<EoF > emr-trust-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "elasticmapreduce.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EoF

aws iam create-role --role-name $AWS_EKS_CLUSTER-emr-containers-job-execution --assume-role-policy-document file://emr-trust-policy.json

cat <<EoF > emr-containers-job-execution.json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:ListBucket"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "logs:PutLogEvents",
                "logs:CreateLogStream",
                "logs:DescribeLogGroups",
                "logs:DescribeLogStreams"
            ],
            "Resource": [
                "arn:aws:logs:*:*:*"
            ]
        }
    ]
}  
EoF

aws iam create-policy \
 --policy-name $AWS_EKS_CLUSTER-emr-containers-job-execution \
 --policy-document file://emr-containers-job-execution.json

aws iam attach-role-policy \
 --role-name $AWS_EKS_CLUSTER-emr-containers-job-execution \
 --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/$AWS_EKS_CLUSTER-emr-containers-job-execution

aws emr-containers update-role-trust-policy --cluster-name $AWS_EKS_CLUSTER --namespace spark --role-name $AWS_EKS_CLUSTER-emr-containers-job-execution

aws emr-containers create-virtual-cluster \
--name $AWS_EKS_CLUSTER \
--container-provider '{
    "id": "'$AWS_EKS_CLUSTER'",
    "type": "EKS",
    "info": {
        "eksInfo": {
            "namespace": "spark"
        }
    }
}'

export EMR_S3_BUCKET=s3://emr-${AWS_EKS_CLUSTER}-${AWS_ACCOUNT_ID}-${AWS_REGION}
aws s3 mb $EMR_S3_BUCKET