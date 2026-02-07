Deploy the social agent to GCP.

Steps:
1. Run `npm run build` (or `npx tsc`) in the project root to verify TypeScript compiles cleanly
2. If the build fails, fix the errors before proceeding
3. Stage all changed files with `git add` (only relevant source files, not node_modules or .env)
4. Create a git commit with a descriptive message
5. Push to GitHub: `git push`
6. Deploy to GCP VM in one command:
   ```
   gcloud compute ssh social-agent --zone us-central1-b -- 'cd /opt/social-agent && sudo git pull && sudo docker compose up --build -d'
   ```
7. Wait for the build to complete, then verify by checking logs:
   ```
   gcloud compute ssh social-agent --zone us-central1-b -- 'cd /opt/social-agent && sudo docker compose logs --tail 20'
   ```
8. Confirm the agent started successfully (look for "Slack listener started on port 3002")
