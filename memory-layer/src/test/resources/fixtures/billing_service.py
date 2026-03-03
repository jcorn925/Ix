import http_client
from config import RETRY_COUNT

class BillingService:
    def __init__(self, gateway):
        self.gateway = gateway

    def process_payment(self, amount, currency):
        result = self.gateway.charge(amount, currency)
        if not result.success:
            self.retry_handler(amount, currency)
        return result

    def retry_handler(self, amount, currency, max_retries=3):
        for attempt in range(max_retries):
            result = self.gateway.charge(amount, currency)
            if result.success:
                return result
        raise PaymentError("Max retries exceeded")

def standalone_function():
    return BillingService(None)
