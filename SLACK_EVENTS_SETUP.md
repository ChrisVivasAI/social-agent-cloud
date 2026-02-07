# 🚀 Slack Events API Setup Guide

## Overview
This guide will help you set up real-time URL processing in Slack using the Events API. Instead of processing all URLs from channel history, the system will now process only new URLs as they are posted.

## ✅ What's Been Implemented

### 1. **Slack Events API Server** (`src/servers/slack-events-server.ts`)
- Real-time message event processing
- URL extraction from new messages only
- Duplicate prevention (won't process same URL within 5 minutes)
- Integration with LangGraph workflow
- User notifications and confirmations

### 2. **LangGraph Client** (`src/clients/langgraph.ts`)
- Simplified interface for running LangGraph workflows
- Thread management for each URL processing
- Error handling and status tracking

### 3. **Start Script** (`scripts/start-slack-events.ts`)
- Environment variable validation
- Server startup with proper error handling
- Available via `yarn slack:events`

## 🔧 Setup Instructions

### Step 1: Add Required Environment Variables

Add these to your `.env` file:

```env
# Slack Events API configuration
SLACK_SIGNING_SECRET=your_signing_secret_here
SLACK_EVENTS_PORT=3002
```

### Step 2: Get Your Slack Signing Secret

1. Go to your Slack app settings: https://api.slack.com/apps
2. Select your app
3. Go to "Basic Information" → "App Credentials"
4. Copy the "Signing Secret"
5. Add it to your `.env` file as `SLACK_SIGNING_SECRET`

### Step 3: Configure Event Subscriptions

1. In your Slack app settings, go to "Event Subscriptions"
2. Enable Events
3. Set Request URL to: `https://your-domain.com/slack/events`
   - For local development, use ngrok: `https://your-ngrok-url.ngrok.io/slack/events`
4. Subscribe to Bot Events:
   - `message.channels` - Listen for messages in channels
   - `app_mention` - Listen for @mentions

### Step 4: Update Bot Token Scopes

Ensure your bot has these scopes:
- `channels:history` - Read channel messages
- `chat:write` - Send messages
- `app_mentions:read` - Read @mentions

### Step 5: Start the Events Server

```bash
# Start the Slack Events API server
yarn slack:events
```

## 🧪 Testing the Setup

### Test 1: Basic Connectivity
1. Start the server: `yarn slack:events`
2. Check that it's running on port 3002
3. Verify environment variables are loaded

### Test 2: Real-time URL Processing
1. Go to your Slack channel
2. Post a message with a URL: `Check out this article: https://example.com`
3. You should see:
   - Immediate confirmation message in thread
   - Post generation process starting
   - Final confirmation when complete

### Test 3: Duplicate Prevention
1. Post the same URL again within 5 minutes
2. Should not trigger processing (no duplicate notifications)

## 🔍 How It Works

### Message Flow:
1. **User posts URL** in Slack channel
2. **Slack sends event** to your webhook endpoint
3. **Server extracts URLs** from the message
4. **Checks for duplicates** (within 5-minute window)
5. **Triggers LangGraph workflow** for each new URL
6. **Sends confirmations** to user in thread

### Key Features:
- ✅ **Real-time processing** - No delays
- ✅ **Duplicate prevention** - Won't process same URL twice
- ✅ **Thread notifications** - All updates in message thread
- ✅ **Error handling** - Graceful error recovery
- ✅ **Scalable** - Handles multiple URLs per message

## 🚨 Troubleshooting

### Common Issues:

#### 1. "SLACK_SIGNING_SECRET not set"
- Add `SLACK_SIGNING_SECRET=...` to your `.env` file
- Get the secret from your Slack app settings

#### 2. "Webhook URL verification failed"
- Ensure your webhook URL is accessible from the internet
- Use ngrok for local development: `ngrok http 3002`
- Update the Request URL in Slack app settings

#### 3. "No URLs found in message"
- Check that your message contains valid URLs
- URLs should be in format: `https://example.com`

#### 4. "LangGraph server not running"
- Start LangGraph: `yarn langgraph:up`
- Check `LANGGRAPH_API_URL` in your `.env` file

### Debug Commands:
```bash
# Check environment variables
yarn test:slack:connection

# Test manual URL processing
yarn process:slack

# Check LangGraph server
yarn get:scheduled_runs
```

## 🎯 Next Steps

Once this is working, you can:

1. **Add more interactive features** (buttons, modals)
2. **Implement image uploads** for post generation
3. **Add scheduling interface** directly in Slack
4. **Create analytics dashboard** in Slack
5. **Add team collaboration** features

## 📚 Additional Resources

- [Slack Events API Documentation](https://api.slack.com/events-api)
- [Slack Bolt Framework](https://api.slack.com/bolt)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)

---

**Ready to test?** Run `yarn slack:events` and start posting URLs in your Slack channel! 🚀
