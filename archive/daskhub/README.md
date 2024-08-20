## Dask Gateway + JupyterHub on EKS

Source: [Analyze terabyte-scale geospatial datasets with Dask and Jupyter on AWS](https://aws.amazon.com/blogs/publicsector/analyze-terabyte-scale-geospatial-datasets-with-dask-and-jupyter-on-aws/)

### Setup

1. Install the pre-requisites if they are not installed yet.

```bash
./eks-add-ons.sh -i "karpenter load-balancer-controller ebs-csi-driver"
```

2. Install DaskHub.

```bash
curl -o install-daskhub.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/install-daskhub.sh

chmod +x install-daskhub.sh

./install-daskhub.sh
```

3. Once the 'proxy-public' Pod is 'running', run `kubectl port-forward service/proxy-public 8080:http` in the terminal on your client machine and access JupyterHub using `http://localhost:8080`. JupyterHub and Dask Gateway may take a few minutes to initialize after installing.

4. Use the username and password found in the terminal (example below) to log in to JupyterHub.

```bash
JupyterHub Username: user1 / admin1
JupyterHub Password: <generated password>
```

4. Follow the instructions detailed in the section "Run a Jupyter notebook to perform a large-scale geospatial analysis on Dask" in [the article](https://aws.amazon.com/blogs/publicsector/analyze-terabyte-scale-geospatial-datasets-with-dask-and-jupyter-on-aws/) if you need a sample notebook to demonstrate the scalability of EKS + Karpenter.

### Clean Up

1. Remove DaskHub.

```bash
curl -o remove-daskhub.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/remove-daskhub.sh

chmod +x remove-daskhub.sh

./remove-daskhub.sh
```

2. Check if there are any related pods remain in the 'default' namespace (e.g. jupyter-\<username\>) and remove them with `kubectl delete pod <pod-name>`.
