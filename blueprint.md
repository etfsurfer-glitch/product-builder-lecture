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
- **Expanded Blog Section**: Multiple rich blog posts related to site themes (Lotto, Dinner, RPS, general interest) have been added to `index.html`.
- **Enhanced Section Descriptions**: Descriptive and informative introductory texts have been added to the "로또 번호 추출기", "저녁 메뉴 추천", and "가위바위보 게임" sections in `index.html`, along with styling for `.section-description` in `style.css`.
- **Improved SEO Meta-information**: The `<head>` section of `index.html` has been updated with a more descriptive title, meta description, keywords, and Open Graph tags for better search engine visibility and social sharing.
- **개인정보처리방침 (Privacy Policy)**: A `privacy.html` page containing a generic privacy policy, linked from the footer of `index.html`, to ensure legal compliance and build user trust.
- **Read More Functionality for Blog Posts**: Implemented a JavaScript function in `main.js` to toggle the visibility of full blog post content, with an ellipsis for truncated view, enhancing user experience.

## Plan for Current Request: Implement 'Read More' Functionality for Blog Posts

### Objective
Implement a "read more" functionality for blog posts to allow users to view the full content of each post without navigating to a new page, addressing the user's feedback.

### Steps
1.  **Modify `index.html`**: Embedded full blog post content within each post, wrapped extended portions in `<span class="full-post-content">`, added `<span class="ellipsis">` for truncated view, and updated "read more" links with `data-post-id` and `onclick="togglePostContent(this)"` attributes. (Completed)
2.  **Modify `main.js`**: Added the `togglePostContent(button)` function to handle the showing/hiding of full blog post content and changing the button text. (Completed)
3.  **Modify `style.css`**: Added CSS rules to initially hide `.full-post-content` and show `.ellipsis`. (Completed)
4.  **Update `blueprint.md`**: Documented the implementation of the "read more" functionality. (Completed)
5.  **Commit and Push**: Stage all changes, commit them with a descriptive message, and then `git push` to deploy. (Pending)