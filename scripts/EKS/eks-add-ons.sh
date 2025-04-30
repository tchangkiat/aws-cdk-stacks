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
            "6"|"ingress-nginx-controller")
                scripts+=("install-ingress-nginx-controller.sh")
                ;;
            "7"|"app-mesh-controller")
                scripts+=("install-app-mesh-controller.sh")
                ;;
            "8"|"gateway-api-controller")
                scripts+=("install-gateway-api-controller.sh")
                ;;
            "9"|"emr-on-eks")
                scripts+=("setup-emr-on-eks.sh")
                ;;
            "10"|"jupyterhub")
                scripts+=("install-jupyterhub.sh")
                ;;
            "11"|"ray")
                scripts+=("install-ray.sh")
                ;;
            "12"|"argo-cd")
                scripts+=("install-argo-cd.sh")
                ;;
            "13"|"argo-rollouts")
                scripts+=("install-argo-rollouts.sh")
                ;;
            "14"|"opa-gatekeeper")
                scripts+=("install-opa-gatekeeper.sh")
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
            "6"|"ingress-nginx-controller")
                scripts+=("remove-ingress-nginx-controller.sh")
                ;;
            "7"|"app-mesh-controller")
                scripts+=("remove-app-mesh-controller.sh")
                ;;
            "8"|"gateway-api-controller")
                scripts+=("remove-gateway-api-controller.sh")
                ;;
            "9"|"emr-on-eks")
                scripts+=("remove-emr-on-eks.sh")
                ;;
            "10"|"jupyterhub")
                scripts+=("remove-jupyterhub.sh")
                ;;
            "11"|"ray")
                scripts+=("remove-ray.sh")
                ;;
            "12"|"argo-cd")
                scripts+=("remove-argo-cd.sh")
                ;;
            "13"|"argo-rollouts")
                scripts+=("remove-argo-rollouts.sh")
                ;;
            "14"|"opa-gatekeeper")
                scripts+=("remove-opa-gatekeeper.sh")
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
        curl -o $script "https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/${script}"
        chmod +x $script
        ./$script
        rm $script
    done
    echo "Done!"
else
cat << EndOfMessage
--------------------------------------

Install / Remove EKS Add-Ons

--------------------------------------
Command Format:
    
    Install:
    ./eks-add-ons -i "<alias 1> <alias 2>"
    ./eks-add-ons -i "<id 1> <id 2>"
    
    Remove:
    ./eks-add-ons -r "<alias 1> <alias 2>"
    ./eks-add-ons -r "<id 1> <id 2>"
--------------------------------------
List of add-ons (alias are in brackets):

1.  Karpenter ("karpenter")
2.  AWS Load Balancer Controller ("load-balancer-controller")
3.  AWS EBS CSI Driver ("ebs-csi-driver")
4.  Amazon CloudWatch Container Insights ("container-insights")
5.  Prometheus and Grafana ("prometheus-grafana")
    - Prerequisite: AWS EBS CSI Driver
6.  Ingress NGINX Controller ("ingress-nginx-controller")
    - Also installs cert-manager
7.  AWS App Mesh Controller ("app-mesh-controller")
8.  AWS Gateway API Controller ("gateway-api-controller")
9.  Amazon EMR on EKS ("emr-on-eks")
10. JupyterHub ("jupyterhub")
    - Prerequisites: Karpenter, AWS Load Balancer Controller, and AWS EBS CSI Driver
11. Ray ("ray")
    - Prerequisites: Karpenter
12. Argo CD ("argo-cd")
    - Prerequisites: Karpenter, AWS Load Balancer Controller
13. Argo Rollouts ("argo-rollouts")
    - Prerequisites: Karpenter, AWS Load Balancer Controller
14. Open Policy Agent Gatekeeper ("opa-gatekeeper")
    - Includes a constraint template and constraint

EndOfMessage
fi