import json
import base64
import os.path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from ai import summarise
from classifier import classify_email

# If modifying these scopes, delete the file token.json.
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

import base64
from bs4 import BeautifulSoup


def decode_body(data):
    if not data:
        return ""

    return base64.urlsafe_b64decode(data).decode(
        "utf-8",
        errors="ignore"
    )


def html_to_text(html):
    soup = BeautifulSoup(html, "html.parser")

    # Remove non-content tags
    for tag in soup(["script", "style", "head", "meta"]):
        tag.decompose()

    return soup.get_text(separator="\n", strip=True)


def get_header(payload, name):
    for header in payload.get("headers", []):
        if header.get("name", "").lower() == name.lower():
            return header.get("value", "")
    return ""


def get_email_body(payload):
    mime = payload.get("mimeType", "")

    # Plain text
    if mime == "text/plain":
        return decode_body(payload.get("body", {}).get("data"))

    # HTML
    if mime == "text/html":
        html = decode_body(payload.get("body", {}).get("data"))
        return html_to_text(html)

    # Multipart
    for part in payload.get("parts", []):
        body = get_email_body(part)
        if body:
            return body

    # Simple non-multipart message
    if payload.get("body", {}).get("data"):
        return decode_body(payload["body"]["data"])

    return ""

def main():
    """Shows basic usage of the Gmail API.
    Lists the user's Gmail messages.
    """
    creds = None
    # The file token.json stores the user's access and refresh tokens, and is
    # created automatically when the authorization flow completes for the first
    # time.
    if os.path.exists("token.json"):
        creds = Credentials.from_authorized_user_file("token.json", SCOPES)
    # If there are no (valid) credentials available, let the user log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file("credentials.json", SCOPES)
            creds = flow.run_local_server(port=0)
        # Save the credentials for the next run
        with open("token.json", "w") as token:
            token.write(creds.to_json())

    try:
        # Call the Gmail API
        service = build("gmail", "v1", credentials=creds)
        results =  service.users().messages().list(userId="me", labelIds=["INBOX"], q="newer_than:1d").execute()
        # print(results)
        messages = results.get("messages", [])

        if not messages:
            print("No messages found.")
            return

        print("Messages:")
        emails = []
        for message in messages:
            print(f'Message ID: {message["id"]}')
            msg = service.users().messages().get(userId="me", id=message["id"]).execute()

            email_data = {
                "id": msg["id"],
                "threadId": msg["threadId"],
                "labelIds": msg.get("labelIds", []),
                "snippet": msg.get("snippet", ""),
                "subject": get_header(msg["payload"], "Subject"),
                "body": get_email_body(msg["payload"]),
            }

            classification = classify_email(email_data)
            print(classification.model_dump())
            if not classification.is_relevant:
                continue

            email_data["classification"] = classification.model_dump()
            emails.append(email_data)

        if not emails:
            print("No job-related emails found.")
            return

        summary = summarise(emails)
        print(f"Summary: {summary}")

    except HttpError as error:
        # TODO(developer) - Handle errors from gmail API.
        print(f"An error occurred: {error}")
        
    # print(f"Emails: {emails}")
if __name__ == "__main__":
    main()