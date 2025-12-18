# Everflow Tag for GTM Server-Side

This server-side tag allows you to track Everflow conversions via server-to-server (S2S) postbacks and handle Click ID storage directly from your Google Tag Manager Server container.

## Features

- **Event Support**: Handles **Page View** (for storing Click IDs) and **Conversion** (for postbacks with Redirect Linking).
- **Cookie Management**: Automatically extracts the Click ID from the URL during a Page View and stores it as the `_ef_transaction_id` first-party cookie.
- **Custom Parameters**: Supports sending additional parameters with the conversion postback.
- **Optimistic Scenario**: Option to trigger `gtmOnSuccess()` immediately without waiting for the API response.

## Configuration

### 1. Event Type

- **Page View**: Fires when a user reaches the landing page to store the Click ID.
  - **Override default Click ID Key**: Check to specify a custom query parameter (defaults to `_ef_transaction_id`).
  - **Cookie Settings**: Define **Expiration** (days), **SameSite**, **Domain**, and **HttpOnly** flag for the Click ID cookie (`ef_transaction_id`).

- **Conversion**: Sends a postback to Everflow.
  - **Click ID**: The unique tracking ID (usually retrieved from the cookie set by the Page View event).
  - **Conversion Postback URL**: Your offer's postback URL (e.g. `https://{TRACKING_DOMAIN}.com/?nid={NID}&transaction_id={TRANSACTION_ID}`). Must include `nid` and `transaction_id` parameters.
  - **Optional Parameters**: Use the table to map specific key-value pairs to append to the postback URL.
    - Learn more:
      - [Accessing & Editing S2S Postback URLs](https://helpdesk.everflow.io/customer/accessing-editing-s2s-postback-urls)
      - [Clickless Conversion Tracking](https://helpdesk.everflow.io/customer/clickless-conversion-tracking)
      - [Using Coupon Codes For Clickless Tracking](https://helpdesk.everflow.io/customer/using-coupon-codes-for-clickless-tracking)

  > ⚠️ Note that the tag only natively supports the [Redirect Linking](https://helpdesk.everflow.io/customer/understanding-tracking-with-server-to-server-postbacks#with-redirect-linking) tracking type. For the [Direct Linking](https://helpdesk.everflow.io/customer/understanding-tracking-with-server-to-server-postbacks#with-direct-linking) you'll have to resort on **Clickless** tracking via the _Optional Parameters_ on the _Conversion Data_ section in the tag template.
  > [Learn more](https://helpdesk.everflow.io/customer/introduction-to-tracking-links-click-tracking-redirect-direct) about the Tracking Linking types.

  - **Validation**: The request must contain any of the following to be valid:
    - **Click ID Value** (`transaction_id` parameter).
    - **Coupon Code** (`coupon_code` parameter for Clickless conversion tracking).
    - **Affiliate ID** and **Offer ID** (`affid` and `oid` parameters for Clickless conversion tracking).


### 2. General Settings

- **Use Optimistic Scenario**: Check to fire the tag success trigger regardless of the actual API result.
- **Ad Storage Consent**: Choose "Send data in case marketing consent given" to abort execution if `ad_storage` is not granted.

### 3. Logging

- **Logs Settings**: Options to log to console "Always", "Never", or during "Debug and preview".
- **BigQuery Logs**: Enable to log full event data to a BigQuery table.
- **Project ID**: Defaults to `GOOGLE_CLOUD_PROJECT` environment variable if empty.
- **Dataset ID**: Required.
- **Table ID**: Required.

## Open Source

The **Everflow Tag for GTM Server Side** is developed and maintained by the [Stape Team](https://stape.io/) under the Apache 2.0 license.
