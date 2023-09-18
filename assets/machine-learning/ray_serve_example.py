import os
import tempfile

from ray import serve

import pickle
from starlette.requests import Request
from typing import Dict

@serve.deployment
class ResalePriceModel:
    def __init__(self, model_path: str):
        with open(model_path, "rb") as f:
            self.model = pickle.load(f)

    async def __call__(self, starlette_request: Request) -> Dict:
        payload = await starlette_request.json()
        print("Worker: received starlette request with data", payload)

        input_vector = [
            payload["town_group"],
            payload["floor_area_sqm"],
            payload["storey_range_group"],
            payload["lease_commence_date"],
        ]
        prediction = self.model.predict([input_vector])[0]
        return {"result": prediction}
    
resale_price_model = ResalePriceModel.bind("model.pkl")