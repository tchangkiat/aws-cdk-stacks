#!/bin/bash

export package_name="lambda_api_gateway"

rm "${package_name}.zip"

pip3 install \
--platform manylinux2014_aarch64 \
--target="${package_name}" \
--implementation cp \
--python-version 3.12 \
--only-binary=:all: --upgrade \
boto3==1.35.1 pyjwt==2.9.0

cp assets/api-gateway/*.py "${package_name}"
# Remove __pycache__ folder, .pyc, and .pyo files
find "${package_name}" | grep -E "(__pycache__|\.pyc|\.pyo$)" | xargs rm -rf

cd "${package_name}"
zip -r "../${package_name}.zip" .
cd ..

rm -r "${package_name}"