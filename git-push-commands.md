# Git Commands to Push Updates (excluding docker-compose.yml)

## Option 1: If this is a new git repository

```bash
# Navigate to your project folder
cd "C:\Users\WorkAccount\Downloads\EMS 18\EMS-upload"

# Initialize git (if not already initialized)
git init

# Add remote repository (replace with your actual GitHub repo URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Stage all files except docker-compose.yml
git add .
git reset HEAD docker-compose.yml

# Or alternatively, add files individually:
git add src/
git add Dockerfile
git add .dockerignore
git add package.json
git add package-lock.json
git add server.js
git add public/
git add tailwind.config.js
git add postcss.config.js
git add postinstall.js

# Commit changes
git commit -m "Fix API URLs for production deployment - use relative paths instead of localhost"

# Push to GitHub
git push -u origin main
# OR if your default branch is master:
# git push -u origin master
```

## Option 2: If already a git repository (recommended)

```bash
# Navigate to your project folder
cd "C:\Users\WorkAccount\Downloads\EMS 18\EMS-upload"

# Check status
git status

# Stage all files except docker-compose.yml
git add .
git reset HEAD docker-compose.yml

# Check what will be committed (verify docker-compose.yml is NOT in the list)
git status

# Commit changes
git commit -m "Fix API URLs for production deployment - use relative paths instead of localhost

- Updated all frontend API calls to use relative URLs
- Fixed Login.js, TaskConfigContext.js, and 28 other component files
- Created apiConfig.js utility for environment-based API URLs
- All API calls now work in production deployment"

# Push to GitHub
git push origin main
# OR if your branch name is different:
# git push origin master
# OR if you're on a feature branch:
# git push origin your-branch-name
```

## Option 3: Using .gitignore to permanently exclude docker-compose.yml

If you want docker-compose.yml to never be committed:

```bash
# Create or edit .gitignore file
# Add this line:
echo docker-compose.yml >> .gitignore

# Then proceed with normal git commands
git add .
git commit -m "Fix API URLs for production deployment"
git push origin main
```

## Alternative: Stage specific files only

```bash
# Stage only the files you want to commit
git add src/
git add Dockerfile
git add .dockerignore
git add package.json
git add package-lock.json
git add server.js
git add public/
git add tailwind.config.js
git add postcss.config.js
git add postinstall.js

# Check status to verify docker-compose.yml is not staged
git status

# Commit
git commit -m "Fix API URLs for production deployment"

# Push
git push origin main
```

## Verify docker-compose.yml is excluded

Before committing, always check:
```bash
git status
```

Make sure `docker-compose.yml` is NOT listed under "Changes to be committed"

