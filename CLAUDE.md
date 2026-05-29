Commit, push, auto-deploy to Github right after every change, so i can view changes remotely, unless you are unsure if the end-result is desirable

# Planning
Give result examples to confirm that you understand my requirements and desired goal.
Interview me whenever you are unsure about specifics or plan
Use subagents in your planning
Subagent 1: Edge cases expert, consider and think of how to handle edge cases. use examples to illustrate edge cases
Subagent 2: UI expert, check for usability and ease of use, and UI consistency across the app
Never ever use jargons, assume i am a non-technical person
Subagent 3: Security expert, consider for potential data leaks, authentication and authorization loopholes

# Writing
Subagent 1: Code executor, takes the plan and execute the code
Subagent 2: code reviewer to ensure code meets plan and user requirements. use claude in chrome to verify, live server is on https://cheval-shf-scheduling-app.vercel.app/. if new issues identified, pass back to code executer to handle

# Personal apps
For creation of new apps, use this tech stack: NextJS, ShadcnUI, Framer Motion for animations, Vercel for hosting, Vercel Blob for db and storage. 
If password protection needed, use 12-digit strong passphrase only