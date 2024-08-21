import datetime
import json
import jwt


def handler(event, context):
    token = generate_jwt({"username": "user1"}, "ExampleSecretKey")
    return {"isBase64Encoded": False, "statusCode": 200, "headers": {}, "body": token}


def generate_jwt(payload, secret_key, expiration_minutes=30, algorithm="HS256"):
    # Set the expiration time for the token
    expiration_time = datetime.datetime.now() + datetime.timedelta(
        minutes=expiration_minutes
    )

    # Add the expiration time to the payload
    payload["exp"] = expiration_time

    # Generate the JWT
    token = jwt.encode(payload, secret_key, algorithm)

    return token
