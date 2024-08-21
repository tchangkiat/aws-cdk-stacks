import time
import json
import jwt


def handler(event, context):
    token = event["authorizationToken"]
    if len(token.split(".")) != 3:
        raise Exception("Unauthorized")
    print(event)
    try:
        payload = decode_jwt(token, "ExampleSecretKey")
        if payload["exp"] <= int(time.time()):
            raise Exception("Unauthorized")
        if payload["username"] == "user1":
            print("Authorized")
            response = generatePolicy("user", "Allow", event["methodArn"])
        else:
            print("Unauthorized")
            raise Exception("Unauthorized")
        return json.loads(response)
    except Exception as e:
        print(e)
        raise Exception("Unauthorized")


def generatePolicy(principalId, effect, resource):
    authResponse = {}
    authResponse["principalId"] = principalId
    if effect and resource:
        policyDocument = {}
        policyDocument["Version"] = "2012-10-17"
        policyDocument["Statement"] = []
        statementOne = {}
        statementOne["Action"] = "execute-api:Invoke"
        statementOne["Effect"] = effect
        statementOne["Resource"] = resource
        policyDocument["Statement"] = [statementOne]
        authResponse["policyDocument"] = policyDocument
    # authResponse["context"] = {
    #     "stringKey": "stringval",
    #     "numberKey": 123,
    #     "booleanKey": True,
    # }
    authResponse_JSON = json.dumps(authResponse)
    return authResponse_JSON


def decode_jwt(token, secret_key, algorithm="HS256"):
    payload = jwt.decode(token, secret_key, algorithm)
    return payload
