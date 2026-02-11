# Project Blueprint

## Project Overview
This is a framework-less web project consisting of `index.html`, `style.css`, and `main.js`. The AI is tasked with adding dark mode and light mode functionality, a "저녁 메뉴 추천" (dinner menu recommendation) feature with images, ensuring all user-facing text is in Korean, and integrating a Formspree contact form for partnership inquiries.

## Current Features
- Basic HTML structure (`index.html`)
- Basic styling (`style.css`)
- Basic JavaScript logic (`main.js`)
- Dark Mode/Light Mode Toggle: Users can switch between dark and light themes, and their preference is saved locally.
- 저녁 메뉴 추천 (Dinner Menu Recommendation): A section recommending dinner menus with a button to get new recommendations, fully localized in Korean, now including images.
- **제휴 문의 (Partnership Inquiry) Form**: A simple contact form integrated with Formspree for partnership inquiries.

## Plan for Current Request: Integrate Formspree Partnership Inquiry Form

### Objective
Add a simple "제휴 문의" (partnership inquiry) contact form using Formspree to the `index.html` page.

### Steps
1.  **Update `blueprint.md`**: Document the new task for integrating the Formspree contact form. (Completed)
2.  **Modify `index.html`**:
    *   Add a new section for the "제휴 문의" form below the dinner menu section. (Completed)
    *   Include a title for the section (e.g., "제휴 문의"). (Completed)
    *   Create a `<form>` element with the provided Formspree endpoint (`https://formspree.io/f/xlgwgljw`) as its `action` and `method="POST"`. (Completed)
    *   Add basic form fields: name (`이름`), email (`이메일`), and message (`문의 내용`), each with appropriate `name` attributes for Formspree. (Completed)
    *   Include a submit button (`제출하기`). (Completed)
3.  **Modify `style.css`**: Add basic styling for the new form elements (labels, inputs, textarea, button) to ensure they fit the existing theme and layout. (Completed)
4.  **Modify `main.js`**: No JavaScript changes are strictly necessary for a basic Formspree integration. (Completed)
5.  **Commit and Push**: Stage all changes, commit them with a descriptive message, and then `git push` to deploy. (Pending)