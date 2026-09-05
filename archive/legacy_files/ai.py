import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

load_dotenv()

model = ChatOpenAI(
    model="gpt-4o-mini",
    api_key=os.environ["OPENAI_API_KEY"],
)

def summarise(emails: list) -> str:
    # Combine all email bodies into a single string
    combined_emails = "\n\n".join(email['body'] for email in emails)

    # Create a prompt for summarization
    prompt = f"""
You are my personal email assistant.

Below are the emails I received since yesterday.

Create a morning briefing.

Requirements:
- Group similar emails together.
- Ignore signatures, disclaimers and repetitive boilerplate.
- Ignore promotional or low-value emails unless they require my attention.
- Highlight anything requiring action.
- Mention important financial notifications.
- Mention deadlines and interview updates.

Emails:

{combined_emails}
"""

    # Get the summary from the model
    summary = model.invoke(prompt)

    return summary.content # type: ignore