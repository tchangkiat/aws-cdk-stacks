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
            scripts+="install-karpenter.sh"
            break
            ;;
        "2"|"load-balancer-controller")
            scripts+="install-load-balancer-controller.sh"
            break
            ;;
        "3"|"ebs-csi-driver")
            scripts+="install-ebs-csi-driver.sh"
            break
            ;;
        "4"|"container-insights")
            scripts+="install-container-insights.sh"
            break
            ;;
        "5"|"prometheus-grafana")
            scripts+="install-prometheus-grafana.sh"
            break
            ;;
        "6"|"ingress-nginx-controller")
            scripts+="install-ingress-nginx-controller.sh"
            break
            ;;
        "7"|"app-mesh-controller")
            scripts+="install-app-mesh-controller.sh"
            break
            ;;
        "8"|"gateway-api-controller")
            scripts+="install-gateway-api-controller.sh"
            break
            ;;
        "9"|"emr-on-eks")
            scripts+="setup-emr-on-eks.sh"
            break
            ;;
        *) echo "Invalid option $REPLY"
    esac
done

for removal in "${removals[@]}"; do
    case $removal in
        "1"|"karpenter")
            scripts+="remove-karpenter.sh"
            break
            ;;
        "2"|"load-balancer-controller")
            scripts+="remove-load-balancer-controller.sh"
            break
            ;;
        "3"|"ebs-csi-driver")
            scripts+="remove-ebs-csi-driver.sh"
            break
            ;;
        "4"|"container-insights")
            scripts+="remove-container-insights.sh"
            break
            ;;
        "5"|"prometheus-grafana")
            scripts+="remove-prometheus-grafana.sh"
            break
            ;;
        "6"|"ingress-nginx-controller")
            scripts+="remove-ingress-nginx-controller.sh"
            break
            ;;
        "7"|"app-mesh-controller")
            scripts+="remove-app-mesh-controller.sh"
            break
            ;;
        "8"|"gateway-api-controller")
            scripts+="remove-gateway-api-controller.sh"
            break
            ;;
        "9"|"emr-on-eks")
            scripts+="remove-emr-on-eks.sh"
            break
            ;;
        *) echo "Invalid option $REPLY"
    esac
done

if [[ ${#scripts[@]} -ne 0 ]]
then
    for scripts in "${scripts[@]}"; do
        curl -o $script "https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/${script}"
        chmod +x $script
        ./$script
        rm $script
    done
    echo "Done!"
fi