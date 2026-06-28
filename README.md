# CreatorOS

FreeCut-based creator studio with Lee Animations automation.

## Quick Start

### First time setup
Double-click `setup.bat` (Windows) or run:
```
npm run setup
```

### Launch everything
Double-click `start.bat` or run:
```
npm start
```

Then open **http://localhost:5173** in Chrome or Edge.

## Services
| Service | URL | Purpose |
|---------|-----|---------|
| FreeCut Editor | http://localhost:5173 | Video editing |
| Automation Server | http://localhost:3737 | Lee Animations AI |
| OmniRoute Gateway | http://localhost:20128 | Free AI routing |

## Manual start (without OmniRoute)
```
npm run start:no-omni
```
