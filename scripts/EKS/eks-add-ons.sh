#!/bin/bash

echo ""
echo "---------------------------------"
echo "Install / Remove EKS Add-Ons"
echo "---------------------------------"
echo "Cluster: ${AWS_EKS_CLUSTER}"
echo "Region: ${AWS_REGION}"
echo "---------------------------------"
echo ""

script=""

PS3="Select an option: "
options=(
    "Karpenter - Install"
    "Karpenter - Remove"
    "AWS Load Balancer Controller - Install"
    "AWS Load Balancer Controller - Remove"
    "AWS EBS CSI Driver - Install"
    "AWS EBS CSI Driver - Remove"
    "Container Insights - Install"
    "Container Insights - Remove"
    "Quit")

select opt in "${options[@]}"
do
    case $opt in
        "Karpenter - Install")
            script="install-karpenter.sh"
            break
            ;;
        "Karpenter - Remove")
            script="remove-karpenter.sh"
            break
            ;;
        "AWS Load Balancer Controller - Install")
            script="install-load-balancer-controller.sh"
            break
            ;;
        "AWS Load Balancer Controller - Remove")
            script="remove-load-balancer-controller.sh"
            break
            ;;
        "AWS EBS CSI Driver - Install")
            script="install-ebs-csi-driver.sh"
            break
            ;;
        "AWS EBS CSI Driver - Remove")
            script="remove-ebs-csi-driver.sh"
            break
            ;;
        "Container Insights - Install")
            script="install-container-insights.sh"
            break
            ;;
        "Container Insights - Remove")
            script="remove-container-insights.sh"
            break
            ;;
        "Prometheus and Grafana - Install")
            script="install-prometheus-grafana.sh"
            break
            ;;
        "Prometheus and Grafana - Remove")
            script="remove-prometheus-grafana.sh"
            break
            ;;
        "Ingress NGINX Controller - Install")
            script="install-ingress-nginx-controller.sh"
            break
            ;;
        "Ingress NGINX Controller - Remove")
            script="remove-ingress-nginx-controller.sh"
            break
            ;;
        "Amazon EMR on EKS - Install")
            script="setup-emr-on-eks.sh"
            break
            ;;
        "Amazon EMR on EKS - Remove")
            script="remove-emr-on-eks.sh"
            break
            ;;
        "Quit")
            break
            ;;
        *) echo "Invalid option $REPLY"
    esac
done

if [[ $script != "" ]] then
    curl -o $script "https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/${script}"
    chmod +x $script
    ./$script
    rm $script
    echo "Done!"
fi