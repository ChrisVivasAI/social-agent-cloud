Check the GCP social agent logs.

Run this command to get the latest logs from the GCP VM:
```
gcloud compute ssh social-agent --zone us-central1-b -- 'cd /opt/social-agent && sudo docker compose logs --tail 100 --no-log-prefix'
```

If the user asks for more lines or to follow logs, adjust accordingly:
- More lines: change `--tail 100` to a higher number
- Follow live: this won't work well over non-interactive SSH, so suggest the user SSH in directly with `gcloud compute ssh social-agent --zone us-central1-b` and then run `cd /opt/social-agent && sudo docker compose logs -f`
