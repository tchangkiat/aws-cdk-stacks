#!/bin/bash

scripts=()

while getopts "i:r:" opt; do
    case $opt in
        i) installs+=("$OPTARG");;
        r) removals+=("$OPTARG");;
    esac
done
shift $((OPTIND -1))

for install in "${installs[@]}"; do
    for add_on_id_or_alias in $install
    do
        case $add_on_id_or_alias in
            "1"|"karpenter")
                scripts+=("install-karpenter.sh")
                ;;
            "2"|"load-balancer-controller")
                scripts+=("install-load-balancer-controller.sh")
                ;;
            "3"|"ebs-csi-driver")
                scripts+=("install-ebs-csi-driver.sh")
                ;;
            "4"|"container-insights")
                scripts+=("install-container-insights.sh")
                ;;
            "5"|"prometheus-grafana")
                scripts+=("install-prometheus-grafana.sh")
                ;;
            "6"|"gateway-api-controller")
                scripts+=("install-gateway-api-controller.sh")
                ;;
            "7"|"emr-on-eks")
                scripts+=("setup-emr-on-eks.sh")
                ;;
            "8"|"jupyterhub")
                scripts+=("install-jupyterhub.sh")
                ;;
            "9"|"ray")
                scripts+=("install-ray.sh")
                ;;
            "10"|"argo-cd")
                scripts+=("install-argo-cd.sh")
                ;;
            "11"|"argo-rollouts")
                scripts+=("install-argo-rollouts.sh")
                ;;
            "12"|"locust")
                scripts+=("install-locust.sh")
                ;;
            "13"|"kafka")
                scripts+=("install-kafka.sh")
                ;;
            *) echo "Invalid option $REPLY"
        esac
    done
done

for removal in "${removals[@]}"; do
    for add_on_id_or_alias in $removal
    do
        case $add_on_id_or_alias in
            "1"|"karpenter")
                scripts+=("remove-karpenter.sh")
                ;;
            "2"|"load-balancer-controller")
                scripts+=("remove-load-balancer-controller.sh")
                ;;
            "3"|"ebs-csi-driver")
                scripts+=("remove-ebs-csi-driver.sh")
                ;;
            "4"|"container-insights")
                scripts+=("remove-container-insights.sh")
                ;;
            "5"|"prometheus-grafana")
                scripts+=("remove-prometheus-grafana.sh")
                ;;
            "6"|"gateway-api-controller")
                scripts+=("remove-gateway-api-controller.sh")
                ;;
            "7"|"emr-on-eks")
                scripts+=("remove-emr-on-eks.sh")
                ;;
            "8"|"jupyterhub")
                scripts+=("remove-jupyterhub.sh")
                ;;
            "9"|"ray")
                scripts+=("remove-ray.sh")
                ;;
            "10"|"argo-cd")
                scripts+=("remove-argo-cd.sh")
                ;;
            "11"|"argo-rollouts")
                scripts+=("remove-argo-rollouts.sh")
                ;;
            "12"|"locust")
                scripts+=("remove-locust.sh")
                ;;
            "13"|"kafka")
                scripts+=("remove-kafka.sh")
                ;;
            *) echo "Invalid option $REPLY"
        esac
    done
done

if [[ ${#scripts[@]} -ne 0 ]]
then
    echo ""
    echo "--------------------------------------"
    echo "Account: ${AWS_ACCOUNT_ID}"
    echo "Region: ${AWS_REGION}"
    echo "EKS Cluster: ${AWS_EKS_CLUSTER}"
    echo "--------------------------------------"
    echo ""

    for script in "${scripts[@]}"; do
        curl -o $script "https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/eks/${script}"
        chmod +x $script
        ./$script
        rm $script
    done
    echo "Done!"
else
cat << EndOfMessage
----------------------------------------------------------------------
EKS Add-Ons Script
----------------------------------------------------------------------
Install:
        ./eks-add-ons.sh -i "<alias 1> <alias 2>"
        ./eks-add-ons.sh -i "<id 1> <id 2>"
    
Remove:
        ./eks-add-ons.sh -r "<alias 1> <alias 2>"
        ./eks-add-ons.sh -r "<id 1> <id 2>"
----------------------------------------------------------------------
Add-Ons (aliases are in brackets):

1.  Karpenter ("karpenter")
2.  AWS Load Balancer Controller ("load-balancer-controller")
3.  AWS EBS CSI Driver ("ebs-csi-driver")
4.  Amazon CloudWatch Container Insights ("container-insights")
5.  Prometheus and Grafana ("prometheus-grafana")
    - Prerequisite: AWS EBS CSI Driver
6.  AWS Gateway API Controller ("gateway-api-controller")
7.  Amazon EMR on EKS ("emr-on-eks")
8.  JupyterHub ("jupyterhub")
    - Prerequisites: Karpenter, AWS Load Balancer Controller, and AWS EBS CSI Driver
9. Ray ("ray")
    - Prerequisites: Karpenter
10. Argo CD ("argo-cd")
    - Prerequisites: Karpenter, AWS Load Balancer Controller
11. Argo Rollouts ("argo-rollouts")
    - Prerequisites: Karpenter, AWS Load Balancer Controller
12. Locust ("locust")
    - Prerequisites: Karpenter
13. Kafka ("kafka")
    - Prerequisites: Karpenter, AWS Load Balancer Controller, and AWS EBS CSI Driver
----------------------------------------------------------------------

EndOfMessage
fi