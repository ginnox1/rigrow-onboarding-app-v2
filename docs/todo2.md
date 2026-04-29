[ x ] Map page - 'Coninue' button must be grayed out until all data meet criteria. A>0.5, ad all fields appropriately filled. Other selection, opens an input box (verified for string content) before continue. Prompt 'Please complete all fields' must be more explanatory of the issue.

[ x ] Register, Confirm and Continue, 'Agent REquest', should grayout the buttons to prohibit further clicks, and show progress (animated circle) until displaying the completion page (if succesful), or alert of problem.

[ x ] 2026-04-20T15:20:29.233Z is what i am getting at the CRM for gps coordinates. I expeect x, y pair for a pin, and x1,y1; x2,y2;... at least three pairs for boundary data.

[ x ] Agent Request sent must be a page informing 'Request sent. An agent will reachout etc...' and provide 'Back to Home' button. Now it simply continues to the Pricing page.


[ x ] Apply the gray button effect on phone input page - just like the continue button on  'tell us about your self' page.

[  ] Not now? --> You can return any time to sign up your farm. We'll send updates via SMS/Whatsapp.

# UI/UX
[ x ] Agent request, Not now, Back, Back to home,... all underlined links change to proper button

[ x ] You're registered page, add "you can now start recieving the services ... mobile app. uusd coming." Refer to the images in onboarding/public/sample. Modify other pages based on the sample images here.

[ x ] uase actual rigrow logo instead of the crop emoji you have. now included in onboarding/public/assets

[ x ] Dark | Light | High ocntrast mode. The high contrast view is key, since most actions may happen under sunlight.

[ x ] On completion page after pin/bound farm, offer user to their fields. On click, Go back to 'welcome back page', with their current field appended to the list of farms. Note, the data may be relayed latter when connection becomes available. Immediately, they need to access their farm list, along with the calculate button. 

# New 

[ x ] Create a separate download page for the mobile app. Both completion pages lead to this page. This download page should explain the app, show 4 or 5 screen shots (stacked side by side, and scrollable left to right), and a teaser. The page also needs a counter, that sends the data to another google sheet (Time stamp, phone nr, ..).

Include a note: "You will need the userId sent to your SMS to login."

Requirement section: Any smart phone with touch screen. Includes low end devices.
A few minutes of internet connection per day.

[ x ] i8n translations

[ x ] Include a gps coordinate input method along side 'Load Map' option on Map page. This allows to input latitude and longitude in separate input boxes in the same row. A validate icon in the same row, checks agains max min limits for each country in .env, and shows a tick mark. Continue button is active only if validated correctly.

[ x ] include coords optin to map input (one or more pairs) with assist function to calcualte area.

[ x ] sync crops to those available in calculator. Pepper, Kale, Brocolli, Tomato, Cabage, Onion, Garlic, Potato, Sweet Potato, Lentils, Maize, Wheat, Teff, Barley, Sorghun, 



[ x ] Allow remove fields. We need this feature, because users can make mistakes. I suggest:
- hold push to CRM for 5 or 10mins considering farmers
- put undo or delete button for each field, and keep it for as long as the field is not synced
- if synced remove, the delete button.
- delete by asking user permission first.

[  ] On the 'Tell us about you' page, users enter a locale name (woreda/sub-county/village). We will need to extract gps coordinates for these locations, and i want this to be automated. I am considering to integrate with OpenStreetMap (Nominatim): It’s easy to implement and costs nothing. It’s great for getting that initial "pin" without a billing headache.  Key idea - filter typo errors at capture, and dynamically guide user input as they type woreda/subcounty, while also using the region/conty/country references. Country is deduced from phone nr country code.

You just send a GET request to https://nominatim.openstreetmap.org/search?q={user locale}&format=json.

Plan for this.

[  ] Add "For faster onboarding Pin your farm." on thankyou page of registration.

# TBD

[  ] When calling rigrow-calc, also send user prefered language. Advice what changes to make on the rigrow-calc project.


[  ] Check if bounding string matches, before revealing data. A privacy concern!

[ ! ] How to show last calculated value on the field? This perfection at this stage post pone. [This is an OVERKILL]