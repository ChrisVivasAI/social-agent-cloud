# 🚀 Slack Slash Command Setup Guide

## ✅ **Immediate Solution: Slack Slash Command**

I've created a webhook server that allows you to trigger URL processing immediately using a Slack slash command!

### **Step 1: Webhook Server is Running**
The webhook server is now running on `http://localhost:3001/slack/process-urls`

### **Step 2: Set Up Slack Slash Command**

1. **Go to your Slack app**: [api.slack.com/apps](https://api.slack.com/apps) → Your App
2. **Navigate to "Slash Commands"**
3. **Click "Create New Command"**
4. **Fill in the details**:
   - **Command**: `/process-urls`
   - **Request URL**: `http://localhost:3001/slack/process-urls`
   - **Short Description**: `Process URLs from Slack channel`
   - **Usage Hint**: `Processes all URLs posted in the last 24 hours`
5. **Click "Save"**

### **Step 3: Test the Slash Command**

In your Slack channel, type:
```
/process-urls
```

This will immediately:
- ✅ Process all URLs from your channel in the last 24 hours
- ✅ Generate posts for each URL
- ✅ Send them for human review
- ✅ Show you the thread ID and run ID

## 🔄 **Backup Solution: Automated Cron Job**

For daily automatic processing, also set up the cron job:

```bash
yarn setup:slack:cron
```

This will process URLs daily at midnight automatically.

## 🎯 **How It Works Now**

### **Immediate Processing (Slash Command)**:
1. Post URLs in Slack
2. Type `/process-urls` 
3. URLs are processed immediately
4. Get notifications about scheduled posts

### **Automatic Processing (Cron Job)**:
1. Post URLs in Slack
2. Wait until midnight (or next day)
3. URLs are processed automatically
4. Get notifications about scheduled posts

## 🛠 **Troubleshooting**

### **If slash command doesn't work**:
1. Make sure webhook server is running: `yarn slack:webhook`
2. Check webhook URL is correct in Slack app settings
3. Ensure LangGraph server is running: `yarn langgraph:up`

### **If URLs aren't processed**:
1. Check Slack channel ID is correct in `.env`
2. Make sure bot has access to the channel
3. Verify URLs are valid (not user mentions)

## 📋 **Current Status**

- ✅ **Webhook server**: Running on port 3001
- ✅ **URL extraction**: Fixed (filters out user mentions)
- ✅ **Slack integration**: Working
- ⏳ **Slash command**: Ready to configure in Slack app
- ⏳ **Cron job**: Ready to set up

## 🚀 **Next Steps**

1. **Set up the slash command** in your Slack app (5 minutes)
2. **Test with `/process-urls`** in your channel
3. **Set up cron job** for daily automation: `yarn setup:slack:cron`
4. **Start posting URLs** and using `/process-urls` for immediate processing!

Your Slack integration is now ready for both immediate and automated processing! 🎉
