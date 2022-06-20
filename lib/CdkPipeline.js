const cdk = require("aws-cdk-lib");
const {
  CodePipeline,
  CodePipelineSource,
  ShellStep,
} = require("aws-cdk-lib/pipelines");
const { CdkPipelineAppStage } = require("./CdkPipelineAppStage");

class CdkPipeline extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const pipeline = new CodePipeline(this, "cdk-pipeline", {
      pipelineName: "CdkPipeline",
      synth: new ShellStep("synth", {
        input: CodePipelineSource.gitHub("tchangkiat/aws-cdk-stacks", "main"),
        commands: ["npm ci", "npm run build", "npx cdk synth"],
      }),
    });

    pipeline.addStage(
      new CdkPipelineAppStage(this, "cdk-pipeline-app-stage", {
        env: { account: props.env.account, region: props.env.region },
      })
    );
  }
}

module.exports = { CdkPipeline };
