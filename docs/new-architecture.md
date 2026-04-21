# Proposed "Frictionless" Onboarding Framework
* This is a mandatory comment from a professional business advisor *

We will adopt a strategy of "Progressive Disclosure," hiding technical complexity until the user is personally invested in the outcome. This framework ensures that Rigrow collects "measurable, verifiable outcomes" (the KPIs of water and energy savings) without overwhelming the user during the initial encounter.

The Three-Tier Onboarding Funnel
Tier 1: Lead Capture (The "Call Me" Model) We must align the digital reality with the brand promise: "No forms to fill, no long emails." The initial entry point will be reduced to two fields: Name and Phone Number. By removing mandatory crop and size fields, we maximize the lead volume and signal immediate accessibility.
Tier 2: Value Demonstration (Integrated Calculator) The Rigrow Benefit Calculator must be integrated directly into the main site to avoid external redirects. By showing estimated "Yield Loss Recovered" and ROI before sign-up, we create the psychological "buy-in." Once a farmer sees their potential savings, providing technical data becomes a secondary concern.
Tier 3: Deferred Technical Profiling (Human-in-the-Loop) The collection of GPS coordinates and crop details will be deferred to the 24-hour callback. During this call, a Rigrow agent—not the farmer—will use the 10m Satellite Accuracy to identify the farm blocks remotely while the farmer is on the line. This transforms a technical burden into a premium, human-led concierge service.
This simplified funnel serves as the foundation for a broader communication strategy that prioritizes local accessibility over technical specifications.

# My revised approach for dev
This is a revised workflow for the web app

User opens the app at page-zero. Askes to choose language and input phone number, and [I am an agent] button.

If not an agent, Check user is registered or not, and their level.

## Not registered user
If not registered, start the new-registration page.
- Name
- location (woreda, region)

 send the info to CRM (google sheets).

 Welcome screen. Use USSD or our mobile app to recieve daily weather insights and forecases for your area.

 Want to get field specific advice. List benetifs
 - Saving calculator
 - Basic insight (soild moisture, crop condiion) - free
 - High Precision advise - daily and accurate farm specific insight, AI powered 7 day forecast.
 - [continue], [Exit] buttons.

## Registered user
If already registered, show wellcome back screen with:
- List of existing fields (or you have no fields yet). If fields are available, put a [Calculator] button on the right. It takes user to rigrow-calculator.com (with prefilled area, crop data). Find a way to return calcualted savings.
- Unlock field level insights teaser
- [Pin Your Farm - Free insights] |  [Bound Your Farm - Precision Advice] button options. Both buttons are visible if ONLY no registered fields. If registered fields exist, only one button will be available based on the properties of existing fields. A farmer can either have pinned farms or bounded farms, not both.


Choosing either button opens the map box with modal feature for pin-drop or boundary delineation mode. 

1. Pin-drop mode
   - Accept pin
   - Active area input box
   - crop selection drop menu
   - planting date picker
   - [Request Agent]
2. Boundary mode
    - Accept only area
    - Area input box filled, and disabled. If less than 0.5Ha, disable next features
    - Crop selection drop menu
    - Planting date picker
    - [Request Agent]

Show pricing page:
- Birr 390/ha/month billed annually
- If discount set, show discounted price
- We will send you payment details via sms. Pay with in 24 Hrs
- Services activated with in 72 hours
- Cancel anytime within 14 days (money back).

Upon completion, completion page. Thank you for being a valued customer. You have now X (Basic|Precision) fields. You can now monitor your farm(s) via ussd or mobile app.

[Download Mobile App] | Dial USSD (coming soon)


## Agent mode
If agent, check if registered as agent. Deny access, and advise to contact Rigrow for registering. If registered, continue.

Restart at page-zero. 'Welcome Agent. You are onboarding farmers.' banner on top for all screens.

At the completion page [New Farmer] button, to allow user to start from page-zero for a new farmer.





