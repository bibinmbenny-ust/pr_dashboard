# AI Integration for PR Dashboard

## Overview
The PR Dashboard now includes **GitHub Copilot AI analysis** for failed builds. When a PR has failed CI checks, the system automatically analyzes the failure and provides:
1. **Root Cause Analysis** - What likely caused the failure
2. **Fix Suggestions** - Specific actionable steps to resolve the issue
3. **Prevention Tips** - How to avoid similar issues in the future

## How It Works

### Backend (GitHub Actions Workflow)
The workflow `.github/workflows/check-ci-status.yml` has been enhanced to:
1. Detect when a PR has failed CI checks
2. Gather context: PR title, branch, failed check names, recent commit messages
3. Call GitHub Models API (Azure OpenAI endpoint) with gpt-4o model
4. Store the AI suggestion in `pr-reports/{PROJECT}/pr-list.json`

### Frontend (Dashboard UI)
The dashboard `js/dashboard.js` now:
1. Fetches AI suggestions from the pr-list.json file
2. Displays them in a collapsible "🤖 AI Analysis & Suggestions" card
3. Shows "Powered by GitHub Copilot" attribution
4. Only displays when AI suggestion is available for failed PRs

## Setup Instructions

### 1. GitHub Token Configuration
The workflow uses `secrets.GITHUB_TOKEN` which is automatically provided by GitHub Actions.

**Important:** The GitHub Models API endpoint requires GitHub Copilot access. You may need:
- GitHub Copilot Business subscription for your organization
- OR GitHub Copilot Individual subscription
- OR Azure OpenAI API key (alternative endpoint)

### 2. Testing the Integration

#### Option A: Wait for Next Workflow Run
The workflow runs every 5 minutes. On the next run:
1. It will detect any failed PRs
2. Call the AI API for analysis
3. Update pr-list.json with ai_suggestion field

#### Option B: Manual Trigger
```bash
# Go to: https://github.com/cisco-netsec-sandbox/netsec-fxos-pr-dashboard-poc1/actions
# Click "Check CI Status" workflow
# Click "Run workflow" button
```

### 3. Verify AI Integration

Check the workflow logs:
```bash
# Should see:
🤖 Analyzing failure for PR #XX with AI...
AI Suggestion: [AI response text]
```

Check pr-list.json:
```json
{
  "pull_requests": [
    {
      "number": 4,
      "title": "Test PR",
      "ci_status": "failure",
      "ai_suggestion": "Analyze this GitHub PR CI failure..."
    }
  ]
}
```

View in dashboard:
1. Navigate to PR list
2. Click on a failed PR
3. Look for "🤖 AI Analysis & Suggestions" card below the summary
4. Click to expand and view suggestions

## API Endpoint Options

### Option 1: GitHub Models API (Current)
```yaml
endpoint: https://models.inference.ai.azure.com/chat/completions
auth: Bearer ${{ secrets.GITHUB_TOKEN }}
model: gpt-4o
requirements: GitHub Copilot subscription
```

### Option 2: Azure OpenAI (Alternative)
If GitHub Models API is not available, switch to Azure OpenAI:

```yaml
# In workflow file, replace:
- H "Authorization: Bearer ${{ secrets.GITHUB_TOKEN }}"
# With:
- H "api-key: ${{ secrets.AZURE_OPENAI_API_KEY }}"

# And change endpoint:
"https://YOUR-RESOURCE-NAME.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT-NAME/chat/completions?api-version=2024-02-15-preview"
```

Then add secret to repository:
```bash
# Go to: Settings > Secrets and variables > Actions > New repository secret
Name: AZURE_OPENAI_API_KEY
Value: <your-azure-openai-api-key>
```

### Option 3: OpenAI API (Alternative)
```yaml
endpoint: https://api.openai.com/v1/chat/completions
auth: Bearer ${{ secrets.OPENAI_API_KEY }}
model: gpt-4-turbo-preview
requirements: OpenAI API subscription
```

## Troubleshooting

### AI Suggestion Not Showing
1. **Check workflow logs**: Does the API call succeed?
   - Go to Actions tab
   - Check latest "Check CI Status" run
   - Look for "🤖 Analyzing failure" section

2. **Check pr-list.json**: Does it contain ai_suggestion field?
   ```bash
   # View file in browser:
   https://github.com/cisco-netsec-sandbox/netsec-fxos-pr-dashboard-poc1/blob/main/pr-reports/FXOS/pr-list.json
   ```

3. **Check browser console**: Any JavaScript errors?
   - Open dashboard page
   - Press F12 > Console tab
   - Look for errors

### API Call Fails
**Error: 401 Unauthorized**
- GitHub Models API requires Copilot subscription
- Solution: Switch to Azure OpenAI or OpenAI API

**Error: 403 Forbidden**
- GITHUB_TOKEN doesn't have required permissions
- Solution: Add explicit token with proper scope or use alternative API

**Error: 429 Too Many Requests**
- Rate limit exceeded
- Solution: Add caching mechanism (avoid re-analyzing same failure)

### AI Response is "AI analysis unavailable"
- API call failed silently
- Check workflow logs for curl errors
- Verify endpoint URL and authentication

## Customization

### Adjust AI Prompt
Edit the AI_PROMPT in workflow file to customize the analysis:
```yaml
AI_PROMPT="Analyze this GitHub PR CI failure and provide actionable suggestions:

PR Title: $PR_TITLE
Branch: $PR_BRANCH
Failed Checks: $CHECK_ERRORS
Recent Commits: $COMMIT_MESSAGES

Provide:
1. Likely root cause (2-3 sentences)
2. Specific fix suggestions (2-3 action items)
3. Prevention tips

Be concise and technical."
```

### Change AI Model
```yaml
# In workflow, change:
"model": "gpt-4o"
# To:
"model": "gpt-4-turbo-preview"  # More powerful but slower
# or:
"model": "gpt-3.5-turbo"  # Faster but less accurate
```

### Adjust Token Limit
```yaml
# In workflow, change:
"max_tokens": 500
# To:
"max_tokens": 1000  # More detailed responses
# or:
"max_tokens": 200   # More concise responses
```

## Cost Considerations

### GitHub Models API
- Included with GitHub Copilot Business subscription
- No additional per-request cost
- Rate limits apply

### Azure OpenAI
- Charged per token (input + output)
- gpt-4o: ~$0.03 per 1K input tokens, ~$0.06 per 1K output tokens
- Estimated cost: ~$0.001-0.005 per PR analysis

### OpenAI API
- Similar pricing to Azure OpenAI
- May have higher rate limits

## Future Enhancements

### 1. Caching
Avoid re-analyzing the same failure:
```bash
# Add to workflow:
- Store hash of (PR_NUMBER + FAILED_CHECKS) in cache
- Check cache before calling AI API
- Skip AI call if same failure already analyzed
```

### 2. Feedback Loop
Add thumbs up/down buttons to AI suggestions:
```javascript
// In dashboard.js:
<button onclick="feedbackAI('helpful')">👍</button>
<button onclick="feedbackAI('not-helpful')">👎</button>
```

### 3. Historical Analysis
Store AI suggestions in dashboard_*.json files:
```bash
# In workflow:
# Add ai_suggestion to individual PR detail files
# Allows viewing AI suggestions in revision history
```

### 4. Multi-Stage Analysis
Analyze each failed stage separately:
```bash
# In workflow:
# Loop through each failed check
# Generate separate AI suggestion per failed stage
# Combine into structured response
```

## Support

For issues or questions:
1. Check workflow logs in Actions tab
2. Review browser console for frontend errors
3. Verify API endpoint and authentication
4. Test with manual workflow trigger
5. Check pr-list.json file contents

## License
Part of Cisco NetSec PR Dashboard project
