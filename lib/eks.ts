import { type Construct } from "constructs";
import { Stack, type StackProps, CfnOutput, Tags } from "aws-cdk-lib";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as eks from "aws-cdk-lib/aws-eks";
import type * as ecr from "aws-cdk-lib/aws-ecr";
import { KubectlV32Layer } from "@aws-cdk/lambda-layer-kubectl-v32";

import { ManagedNodeGroup, ClusterAutoscaler } from "../constructs/eks";
import { BastionHost } from "../constructs/bastion-host";
import { Autoscaler } from "../constants";
import { StandardVpc } from "../constructs/network";

export class EKS extends Stack {
	constructor(
		scope: Construct,
		id: string,
		ecrRepository: ecr.Repository,
		sshKeyPairName: string,
		autoscaler?: string,
		props?: StackProps,
	) {
		super(scope, id, props);

		// ----------------------------
		// Configuration
		// ----------------------------

		const eksClusterKubernetesVersion = eks.KubernetesVersion.V1_32;

		const eksClusterName = id + "-demo";

		// ----------------------------
		// VPC
		// ----------------------------

		const vpc = new StandardVpc(this, "vpc", {
			vpcName: id,
		}) as ec2.Vpc;

		for (const subnet of vpc.publicSubnets) {
			// Tags for AWS Load Balancer Controller
			Tags.of(subnet).add("kubernetes.io/cluster/" + eksClusterName, "owned");
			Tags.of(subnet).add("kubernetes.io/role/elb", "1");
		}
		for (const subnet of vpc.privateSubnets) {
			// Tags for AWS Load Balancer Controller
			Tags.of(subnet).add("kubernetes.io/cluster/" + eksClusterName, "owned");
			Tags.of(subnet).add("kubernetes.io/role/internal-elb", "1");
			// Tag for Karpenter
			if (autoscaler === Autoscaler.Karpenter) {
				Tags.of(subnet).add("karpenter.sh/discovery", eksClusterName);
			}
		}

		// ----------------------------
		// IAM
		// ----------------------------

		const eksMasterRole = new iam.Role(this, "master-role", {
			assumedBy: new iam.AccountRootPrincipal(),
			roleName: eksClusterName + "-master-role-" + this.region,
		});
		eksMasterRole.addToPolicy(
			new iam.PolicyStatement({
				resources: ["*"],
				actions: [
					"eks:AccessKubernetesApi",
					"eks:List*",
					"eks:Describe*",
					"ec2:DescribeInstances",
					"iam:ListRoles",
				],
			}),
		);

		// ----------------------------
		// EKS Cluster
		// ----------------------------

		const cluster = new eks.Cluster(this, "cluster", {
			clusterLogging: [eks.ClusterLoggingTypes.API, eks.ClusterLoggingTypes.AUDIT],
			clusterName: eksClusterName,
			defaultCapacity: 0,
			endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE.onlyFrom("0.0.0.0/0"),
			kubectlLayer: new KubectlV32Layer(this, "kubectl-layer"),
			mastersRole: eksMasterRole,
			version: eksClusterKubernetesVersion,
			vpc,
			tags: {
				"eks-cost-cluster": eksClusterName,
				"eks-cost-workload": "Proof-of-Concept",
				"eks-cost-team": "tck",
			},
		});

		eksMasterRole.addToPolicy(
			new iam.PolicyStatement({
				resources: [cluster.clusterArn],
				actions: ["eks:*"],
			}),
		);

		// Install EKS Pod Identity Agent addon
		new eks.Addon(this, "Addon", {
			cluster,
			addonName: "eks-pod-identity-agent",
			addonVersion: "v1.3.0-eksbuild.1",
		});

		// Equivalent to executing `eksctl utils associate-iam-oidc-provider`
		/* new iam.OpenIdConnectProvider(this, "iam-oidc-provider", {
			clientIds: ["sts.amazonaws.com"],
			url: cluster.clusterOpenIdConnectIssuerUrl,
		}); */

		// ----------------------------
		// Addons NodeGroup
		// ----------------------------

		const addonsMng = new ManagedNodeGroup(this, "addons-mng", {
			cluster,
			nodeGroupName: "addons",
			taints: [
				{
					effect: eks.TaintEffect.NO_SCHEDULE,
					key: "CriticalAddonsOnly",
					value: "true",
				},
			],
		}) as eks.Nodegroup;

		// ----------------------------
		// Bastion Host
		// ----------------------------

		const bastionHost = new BastionHost(
			this,
			"bastion-host",
			vpc,
			sshKeyPairName,
			{
				instanceName: eksClusterName + "/bastion-host",
				region: this.region,
				userData: [
					"sudo yum update -y",
					// Git
					"sudo yum install git -y",
					// AWS CLI
					'curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"',
					"unzip awscliv2.zip",
					"sudo ./aws/install",
					// kubectl
					"curl -O https://s3.us-west-2.amazonaws.com/amazon-eks/1.32.0/2024-12-20/bin/linux/arm64/kubectl",
					"chmod +x ./kubectl",
					"mkdir -p $HOME/bin && cp ./kubectl $HOME/bin/kubectl && export PATH=$PATH:$HOME/bin",
					"echo 'export PATH=$PATH:$HOME/bin' >> ~/.bashrc",
					// helm
					"curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3",
					"chmod 700 get_helm.sh",
					"./get_helm.sh",
					// eksctl
					'curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_arm64.tar.gz" | tar xz -C /tmp',
					"sudo mv /tmp/eksctl /usr/local/bin",
					// jq
					"sudo yum install jq -y",
					// Environment Variables
					"echo 'export AWS_ACCOUNT_ID=" +
					this.account +
					"' >> /home/ec2-user/.bashrc",
					"echo 'export AWS_REGION=" + this.region + "' >> /home/ec2-user/.bashrc",
					"echo 'export AWS_EKS_CLUSTER=" +
					cluster.clusterName +
					"' >> /home/ec2-user/.bashrc",
					"echo 'export AWS_EKS_CLUSTER_MASTER_ROLE=" +
					eksMasterRole.roleArn +
					"' >> /home/ec2-user/.bashrc",
					"echo 'export CONTAINER_IMAGE_URL=" +
					ecrRepository.repositoryUri +
					":latest' >> /home/ec2-user/.bashrc",
					// Download script to set up bastion host
					"curl -o /home/ec2-user/setup-bastion-host.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/setup-bastion-host.sh",
					"chmod +x /home/ec2-user/setup-bastion-host.sh",
					// Alias
					"echo 'alias k=kubectl' >> /home/ec2-user/.bashrc",
					"echo 'export KUBE_EDITOR=nano' >> /home/ec2-user/.bashrc",
				],
			},
		) as ec2.Instance;

		bastionHost.addSecurityGroup(cluster.clusterSecurityGroup);
		Tags.of(bastionHost).add("eks-cost-cluster", eksClusterName);
		Tags.of(bastionHost).add("eks-cost-workload", "Proof-of-Concept");
		Tags.of(bastionHost).add("eks-cost-team", "tck");
		bastionHost.node.addDependency(cluster);

		eksMasterRole.addToPolicy(
			new iam.PolicyStatement({
				resources: [
					"arn:aws:ec2:" +
					this.region +
					":" +
					this.account +
					":instance/" +
					bastionHost.instanceId,
				],
				actions: [
					"ec2-instance-connect:OpenTunnel",
					"ec2-instance-connect:SendSSHPublicKey",
					"ec2:osuser",
				],
			}),
		);

		new CfnOutput(this, "Bastion Host Instance Connect URL", {
			value:
				"https://" +
				this.region +
				".console.aws.amazon.com/ec2/v2/home?region=" +
				this.region +
				"#ConnectToInstance:instanceId=" +
				bastionHost.instanceId,
		});

		// ----------------------------
		// Autoscaler
		// ----------------------------

		if (autoscaler === Autoscaler.ClusterAutoscaler) {
			const nodeGroupName = "spot";

			// Create a NodeGroup to run workloads on spot instances
			const spotMng = new ManagedNodeGroup(this, "spot-mng", {
				cluster,
				amiType: eks.NodegroupAmiType.BOTTLEROCKET_X86_64,
				capacityType: eks.CapacityType.SPOT,
				instanceType: "t3.medium",
				nodeGroupName,
			}) as eks.Nodegroup;

			// Grant Cluster Autoscaler permissions to modify Auto Scaling Groups via the node role.
			const caPolicy = new iam.Policy(this, "cluster-autoscaler-policy", {
				policyName: eksClusterName + "-ca-policy",
				statements: [
					new iam.PolicyStatement({
						resources: ["*"], // This should be '*'
						actions: [
							"autoscaling:DescribeAutoScalingGroups",
							"autoscaling:DescribeAutoScalingInstances",
							"autoscaling:DescribeLaunchConfigurations",
							"autoscaling:DescribeScalingActivities",
							"autoscaling:DescribeTags",
							"ec2:DescribeInstanceTypes",
							"ec2:DescribeLaunchTemplateVersions",
						],
					}),
					// Only this policy statement should be updated to restrict the resources / add conditions
					new iam.PolicyStatement({
						resources: ["*"],
						actions: [
							"autoscaling:SetDesiredCapacity",
							"autoscaling:TerminateInstanceInAutoScalingGroup",
							"ec2:DescribeImages",
							"ec2:GetInstanceTypesFromInstanceRequirements",
							"eks:DescribeNodegroup",
						],
					}),
				],
			});

			const ca = new ClusterAutoscaler(this, "cluster-autoscaler", cluster);

			caPolicy.attachToRole(addonsMng.role);

			ca.tagNodeGroups(eksClusterName, [spotMng]);
		}
	}
}
