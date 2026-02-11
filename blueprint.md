# Project Blueprint

## Project Overview
This is a framework-less web project consisting of `index.html`, `style.css`, and `main.js`. The AI is tasked with adding dark mode and light mode functionality, a "저녁 메뉴 추천" (dinner menu recommendation) feature, ensuring all user-facing text is in Korean, and deploying all changes via `git push`.

## Current Features
- Basic HTML structure (`index.html`)
- Basic styling (`style.css`)
- Basic JavaScript logic (`main.js`)
- Dark Mode/Light Mode Toggle: Users can switch between dark and light themes, and their preference is saved locally.
- **저녁 메뉴 추천 (Dinner Menu Recommendation)**: A new section recommending dinner menus with a button to get new recommendations, fully localized in Korean.

## Plan for Current Request: Dinner Menu Recommendation and Korean Localization

### Objective
Add a "저녁 메뉴 추천" (dinner menu recommendation) feature below the existing lotto site, ensure all user-facing text is in Korean, and deploy the changes via `git push`.

### Steps
1.  **Update `blueprint.md`**: Document the new tasks for the dinner menu recommendation, Korean localization, and deployment. (Completed)
2.  **Translate existing text**:
    *   Modify `index.html` to change all English text to Korean. (Completed)
    *   Modify `main.js` to change all English text to Korean. (Completed)
3.  **Implement Dinner Menu Recommendation Feature**:
    *   Modify `index.html` to add a new section for dinner menu recommendation below the lotto numbers section. This section will include a title, a display area for the recommended menu, and a button to get a new recommendation. (Completed)
    *   Modify `style.css` to add styles for the new dinner menu recommendation section. (Completed)
    *   Modify `main.js` to add JavaScript logic for the dinner menu recommendation:
        *   Define a list of Korean dinner menu items. (Completed)
        *   Implement a function to randomly select and display a menu item. (Completed)
        *   Add an event listener to the recommendation button. (Completed)
4.  **Commit and Push**:
    *   Stage all modified files for commit. (Pending)
    *   Provide a draft commit message. (Pending)
    *   Perform `git push` to deploy the changes. (Pending)