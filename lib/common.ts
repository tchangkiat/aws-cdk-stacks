import { type Construct } from "constructs";
import { Stack, type StackProps } from "aws-cdk-lib";
import type * as ec2 from "aws-cdk-lib/aws-ec2";

import { StandardVpc } from "../constructs/network";
import { type GitHubProps } from "../github-props";

export class Common extends Stack {
  public SSHKeyPairName: string;
  public Vpc: ec2.Vpc;
  public GitHub: GitHubProps;
  public EC2UserData: string[];

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

    this.EC2UserData = [
      "sudo yum update -y",
      // Git
      "sudo yum install git -y",
      // zsh and its dependencies
      "sudo yum install -y zsh util-linux-user",
      // Set zsh as default
      "sudo chsh -s /usr/bin/zsh $USER",
      "sudo chsh -s /usr/bin/zsh ec2-user",
      // Install Oh My Zsh
      "sh -c '$(wget https://raw.githubusercontent.com/robbyrussell/oh-my-zsh/master/tools/install.sh -O -)'",
      // Set up Oh My Zsh theme
      "git clone --depth=1 https://github.com/romkatv/powerlevel10k.git /home/ec2-user/.powerlevel10k",
      "curl -o /home/ec2-user/.zshrc https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/assets/zshrc",
      "curl -o /home/ec2-user/.p10k.zsh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/assets/p10k.zsh",
    ];
  }
}
