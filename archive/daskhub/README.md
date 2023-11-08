## Dask + Jupyter on EKS

Credit: [Analyze terabyte-scale geospatial datasets with Dask and Jupyter on AWS](https://aws.amazon.com/blogs/publicsector/analyze-terabyte-scale-geospatial-datasets-with-dask-and-jupyter-on-aws/)

> ❗ Prerequisite #1: Install [Karpenter](#karpenter).

> ❗ Prerequisite #2: Install [AWS Load Balancer Controller](#aws-load-balancer-controller).

> ❗ Prerequisite #3: Install [AWS EBS CSI Driver](#aws-ebs-csi-driver).

### Setup

1. Install DaskHub.

```bash
curl -o install-daskhub.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/install-daskhub.sh

chmod +x install-daskhub.sh

./install-daskhub.sh
```

2. Use the URL, username and password found in the terminal (example below) to access JupyterHub.

```bash
JupyterHub URL: <randomly generated string>.<region>.elb.amazonaws.com
JupyterHub Username: user1 / admin1
JupyterHub Password: <generated password>
```

3. Follow the instructions detailed in the section "Run a Jupyter notebook to perform a large-scale geospatial analysis on Dask" in [the article](https://aws.amazon.com/blogs/publicsector/analyze-terabyte-scale-geospatial-datasets-with-dask-and-jupyter-on-aws/) if you need a sample notebook to demonstrate the scalability of EKS + Karpenter.

### Clean Up

1. Remove DaskHub.

```bash
curl -o remove-daskhub.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/remove-daskhub.sh

chmod +x remove-daskhub.sh

./remove-daskhub.sh
```

2. Check if there are any related pods remain in the 'default' namespace (e.g. jupyter-\<username\>) and remove them with `kubectl delete pod <pod-name>`.
