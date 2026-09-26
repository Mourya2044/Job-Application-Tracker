import warnings
import json
from gliner2 import GLiNER2

# Suppress harmless runtime & future warnings
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=RuntimeWarning)

model = GLiNER2.from_pretrained("fastino/gliner2-multi-v1")


def parse_job_email(email_text: str) -> dict:
    """
    Classifies and extracts structured data from an email according to GLiNER2 documentation.
    Step 1: Gatekeeper classification (job vs non-job)
    Step 2: Unified schema extraction (entities + status classification)
    """
    # 1. Gatekeeper Classification
    type_res = model.classify_text(
        email_text,
        {
            "email_type": [
                "job application or recruitment email",
                "non-job email"
            ]
        }
    )
    email_type = type_res.get("email_type")

    if email_type != "job application or recruitment email":
        return {
            "is_job_related": False,
            "email_type": email_type,
            "data": None
        }

    # 2. Unified Schema: Entities + Status in a single pass
    # Using 'recruiter_title' alongside 'applied_role' ensures GLiNER2
    # accurately disambiguates the candidate's target job from the sender's sign-off.
    schema = (
        model.create_schema()
        .entities({
            "company": "Company Name",
            "applied_role": "Job role or position applied for by the candidate",
            "recruiter_title": "Title or role of the recruiter or sender in the signature",
            "next_step": "Next hiring step or action required",
            "interview_date": "Interview date or scheduling deadline",
            "interview_time": "Interview time or duration",
            "meeting_link": "Calendly, Google Meet, Zoom, or scheduling link"
        })
        .classification("status", ["applied", "screening", "interviewing", "offer", "rejected"])
    )

    extraction = model.extract(email_text, schema)

    return {
        "is_job_related": True,
        "email_type": email_type,
        "status": extraction.get("status"),
        "entities": extraction.get("entities", {})
    }


# ==========================================
# Test Samples
# ==========================================

email_stripe = """
from: no-reply@stripe.com

Subject: Next Steps in Your Application - Backend Software Engineer

Hi Mourya,

Thank you for applying for the Backend Software Engineer position at Stripe.

We have reviewed your application and would like to move forward with an
initial recruiter screening call. Please use the link below to select a
30-minute slot that works for you:

https://calendly.com/stripe-recruiting/initial-screen

The screening call will be held with a member of our Talent Acquisition team.
Please complete the scheduling by September 29, 2026.

If you have any questions, feel free to reply to this email.

Best regards,
Sarah Chen
Technical Recruiter
Stripe
"""

email_amazon = """
Subject: Your Amazon Order Has Been Shipped

Hi Mourya,

Good news! Your order from Amazon has been shipped and is on its way.

Order #114-7283941-5827364

Expected delivery: October 2, 2026.

You can track your package here:
https://www.amazon.in/gp/your-account/order-details

Please make sure someone is available to receive the package.

Thank you for shopping with Amazon.
"""

if __name__ == "__main__":
    print("\n--- Testing Stripe Job Email ---")
    result_stripe = parse_job_email(email_stripe)
    print(json.dumps(result_stripe, indent=2))

    print("\n--- Testing Amazon Order Email ---")
    result_amazon = parse_job_email(email_amazon)
    print(json.dumps(result_amazon, indent=2))


