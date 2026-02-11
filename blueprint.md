# Project Blueprint

## Project Overview
This is a framework-less web project consisting of `index.html`, `style.css`, and `main.js`. The AI is tasked with adding dark mode and light mode functionality, a "저녁 메뉴 추천" (dinner menu recommendation) feature with images, ensuring all user-facing text is in Korean, and deploying all changes via `git push`.

## Current Features
- Basic HTML structure (`index.html`)
- Basic styling (`style.css`)
- Basic JavaScript logic (`main.js`)
- Dark Mode/Light Mode Toggle: Users can switch between dark and light themes, and their preference is saved locally.
- 저녁 메뉴 추천 (Dinner Menu Recommendation): A section recommending dinner menus with a button to get new recommendations, fully localized in Korean, now including images.

## Plan for Current Request: Fix Image Display in Dinner Menu Recommendation

### Objective
Ensure images are reliably displayed in the "저녁 메뉴 추천" section by improving image loading robustness and providing better feedback.

### Steps
1.  **Update `blueprint.md`**: Document the new tasks for fixing image display. (Completed)
2.  **Modify `main.js`**:
    *   Implement `onload` and `onerror` handlers for the `dinnerMenuImage` to manage display and error states. (Completed)
    *   Clear previous image and text content before loading a new recommendation. (Completed)
    *   Temporarily hide the image during loading and show a loading indicator/fallback text. (Completed)
3.  **Modify `index.html`**: (No change needed, `<img>` is already there with `display: none;` as initial state) (Completed)
4.  **Modify `style.css`**: (No change needed initially, may add specific loading indicator styles later if needed) (Completed)
5.  **Commit and Push**: Stage all changes, commit them with a descriptive message, and then `git push` to deploy. (Pending)