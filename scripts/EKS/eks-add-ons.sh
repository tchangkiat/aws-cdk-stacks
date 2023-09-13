#!/bin/bash

echo ""
echo "--------------------------------------"
echo "Account: ${AWS_ACCOUNT_ID}"
echo "Region: ${AWS_REGION}"
echo "EKS Cluster: ${AWS_EKS_CLUSTER}"
echo "--------------------------------------"
echo ""

scripts=()

while getopts "i:r:" opt; do
    case $opt in
        i) installs+=("$OPTARG");;
        r) removals+=("$OPTARG");;
    esac
done
shift $((OPTIND -1))

for install in "${installs[@]}"; do
    case $install in
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
        *) echo "Invalid option $REPLY"
    esac
done

for removal in "${removals[@]}"; do
    case $removal in
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
        *) echo "Invalid option $REPLY"
    esac
done

if [[ ${#scripts[@]} -ne 0 ]]
then
    for script in "${scripts[@]}"; do
        curl -o $script "https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/${script}"
        chmod +x $script
        ./$script
        rm $script
    done
    echo "Done!"
fi