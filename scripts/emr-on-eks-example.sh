# Replace all arrow brackets (<<...>>) with actual values

aws emr-containers start-job-run \
--virtual-cluster-id <<virtual-cluster-id>> \
--name test-emr-on-eks \
--execution-role-arn <<execution-role-arn>> \
--release-label "emr-6.14.0-latest" \
--job-driver '{"sparkSubmitJobDriver": {"entryPoint": "s3://us-east-1.elasticmapreduce/emr-containers/samples/wordcount/scripts/wordcount.py", "entryPointArguments": ["<<your S3 bucket for output>>"], "sparkSubmitParameters": "--conf spark.executor.instances=2 --conf spark.executor.memory=4G --conf spark.executor.cores=1 --conf spark.driver.cores=1 --conf spark.driver.memory=4G"}}'