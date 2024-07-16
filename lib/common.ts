import { type Construct } from "constructs";
import { Stack, type StackProps } from "aws-cdk-lib";
import type * as ec2 from "aws-cdk-lib/aws-ec2";

import { StandardVpc } from "../constructs/network";
import { type GitHubProps } from "../github-props";

export class Common extends Stack {
	public SSHKeyPairName: string;
	public Vpc: ec2.Vpc;
	public GitHub: GitHubProps;

	constructor(scope: Construct, id: string, props?: StackProps) {
		super(scope, id, props);

		this.GitHub = {
			connectionArn: process.env.CDK_GITHUB_CONNECTION_ARN ?? "",
			owner: process.env.CDK_GITHUB_OWNER ?? "",
			repository: process.env.CDK_GITHUB_REPO ?? "",
		};

		this.SSHKeyPairName = "EC2DefaultKeyPair";

		this.Vpc = new StandardVpc(this, "vpc", {
			vpcName: "cdk-stacks",
		}) as ec2.Vpc;
	}
}
