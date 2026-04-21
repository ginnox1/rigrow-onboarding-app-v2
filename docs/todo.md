

[ x ] After registration to level-I, clearly communicate first stage is done. 'Welcome. You can now get weather insights - no setup needed.' Also no IOS app.

[ x ] I'd differ to presenting the PAID services at this page.

[ x ] On 'Yes sign up my farm', Also how do users get the pin-drop service? It directly goeas to boundary mode.

[ x ] Once in 'map page, Users need the [Continue] button if they manage to input their data (and Area is confirmed to be >=0.5Has). If succesful, the data sent to the 'Field Request' page should include list of GPS locations (1 for a pin, >=3 for a boundary - [x1, y1; x2, y2;...] 

If its difficult for them they can choose the 'Request Agent button'. This should send the request to the CRM - new 'Agent Request' page. The intention is for agents to followp with these requests so they can onboard farms (remotely or onsite).

[ x ] In map box, change the cursor to pointer. If the user clicks and holds (tap and hold on mobile), change to pan hand.

[ x ] Recalls where user left off. No way to navigate to fields view or login again. Back to Home, and Back buttons are in order?

[ x ] Do not allow registeration with out compelete info (name, region, woreda). No check is implemented at the moment.

[ x ] Do not allow manual edit of area if user chooses 'Boundary'.

[ x ] Field requests reach CRM. But no GPS data is comming. We need x,y for pins. and array of [x1,y1; x2,y2;...] for boundaries.

[ x ] On you're registered page, let's add a little teaser below the heading 'Want advice specific to your farm?'.

'Why stay on weather data only, when you can get more field level insights.
{Benefits}

Its all free,and signing up your farm is easy. 

[ x ] an agent can input his phone and declare he is an agent. No need for a separate page?
------

[  ] think of a signature mechanism to associate a user access to his phone only (for security - upon registry)

[  ] undelined links, should be proper buttons or is this by design?

[  ] check if gps is recieved.


[  ] Tests
- farmer basic registration
- farmer pin registration
- farmer boundary registration
- farmer agent request
- agent login
- agent onboarding (each of above)

- farmer able to log in (need not registration page), and access their field data from git. Once logged in, a data refresh button will be helpful in case their local copy is outdated, and for them to do it when ever they have connection.

[  ] high contrast display option.


State model is required while form filling (in addition to others), so when users navigate back and forth they dont have to refill informaiton. Once registration is complete, the app should start at logged-in home screen for users, and the customer onboarding form (basic) for agents. When agents input a users phone, if the user is registered (striped down .json file locally kept for checking user status), it should take them to the logged-in home screen for the farmer. The home screen alows farm addition, links to saving calculator.




Map page - 'Coninue' button must be grayed out until all data meet criteria. A>0.5, ad all fields appropriately filled. Other selection, opens an input box (verified for string content) before continue. Prompt 'Please complete all fields' must be more explanatory of the issue.

Register, Confirm and Continue, 'Agent REquest', should grayout the buttons to prohibit further clicks, and show progress (animated circle) until displaying the completion page (if succesful), or alert of problem.

2026-04-20T15:20:29.233Z is what i am getting at the CRM for gps coordinates. I expeect x, y pair for a pin, and x1,y1; x2,y2;... at least three pairs for boundary data.

Agent Request sent must be a page informing 'Request sent. An agent will reachout etc...' and provide 'Back to Home' button. Now it simply continues to the Pricing page.