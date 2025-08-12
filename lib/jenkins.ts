import { Construct } from "constructs";
import { Stack, StackProps, CfnOutput, aws_ec2 as ec2 } from "aws-cdk-lib";
import { EC2Instance } from "../constructs/ec2-instance";
import { EC2InstanceAccess } from "../constants";

export class Jenkins extends Stack {
  constructor(
    scope: Construct,
    id: string,
    vpc: ec2.Vpc,
    sshKeyPairName: string,
    props?: StackProps,
  ) {
    super(scope, id, props);

    const proxyInstance = new EC2Instance(this, "jenkins-proxy", {
      vpc,
      instanceName: "jenkins/proxy",
      instanceType: "t4g.micro",
      instanceAccess: EC2InstanceAccess.SSH,
      sshKeyPairName,
      region: this.region,
      srcDestCheck: false,
    }) as ec2.Instance;

    const jenkinsInstance = new EC2Instance(this, "jenkins-instance", {
      vpc,
      instanceName: "jenkins/main",
      instanceType: "t4g.medium",
      instanceAccess: EC2InstanceAccess.Private,
      sshKeyPairName,
      region: this.region,
      userData: [
        // Install Java
        "sudo yum install java-21-amazon-corretto -y",
        // Install Jenkins
        "sudo wget -O /etc/yum.repos.d/jenkins.repo https://pkg.jenkins.io/redhat-stable/jenkins.repo",
        "sudo rpm --import https://pkg.jenkins.io/redhat-stable/jenkins.io-2023.key",
        "sudo yum upgrade",
        "sudo yum install jenkins -y",
        "sudo systemctl enable jenkins",
        "sudo systemctl start jenkins",
        // AWS CLI
        "curl 'https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip' -o 'awscliv2.zip'",
        "unzip awscliv2.zip",
        "sudo ./aws/install",
        // Git
        "sudo yum install git -y",
      ],
    }) as ec2.Instance;

    new CfnOutput(this, "Command To Proxy To Jenkins", {
      value:
        "ssh -i " +
        sshKeyPairName +
        "-" +
        this.region +
        ".pem -L 8080:" +
        jenkinsInstance.instancePrivateIp +
        ":8080 ec2-user@" +
        proxyInstance.instancePublicIp,
    });

    new CfnOutput(this, "Command To Get Initial Jenkins Admin Password", {
      value:
        "ssh -i " +
        sshKeyPairName +
        "-" +
        this.region +
        ".pem -o ProxyCommand='ssh -i " +
        sshKeyPairName +
        "-" +
        this.region +
        ".pem -W %h:%p ec2-user@" +
        proxyInstance.instancePublicIp +
        "' -i " +
        sshKeyPairName +
        "-" +
        this.region +
        ".pem ec2-user@" +
        jenkinsInstance.instancePrivateIp +
        " 'sudo cat /var/lib/jenkins/secrets/initialAdminPassword'",
    });

    new CfnOutput(this, "Jenkins Proxy Instance Connect URL", {
      value:
        "https://" +
        this.region +
        ".console.aws.amazon.com/ec2/v2/home?region=" +
        this.region +
        "#ConnectToInstance:instanceId=" +
        proxyInstance.instanceId,
    });
  }
}
