const computeEffectiveTldPlusOne = require('computeEffectiveTldPlusOne');
const encodeUriComponent = require('encodeUriComponent');
const getAllEventData = require('getAllEventData');
const getCookieValues = require('getCookieValues');
const getEventData = require('getEventData');
const getRequestHeader = require('getRequestHeader');
const getType = require('getType');
const JSON = require('JSON');
const logToConsole = require('logToConsole');
const makeString = require('makeString');
const makeInteger = require('makeInteger');
const setCookie = require('setCookie');
const parseUrl = require('parseUrl');
const sendHttpRequest = require('sendHttpRequest');

/*==============================================================================
==============================================================================*/

const eventData = getAllEventData();

if (shouldExitEarly(data, eventData)) return;

if (data.type === 'pageview') return storeClickId(data, eventData);
else {
  sendConversion(data);
}

if (data.useOptimisticScenario) {
  return data.gtmOnSuccess();
}

/*==============================================================================
  Vendor related functions
==============================================================================*/

function areThereRequiredParametersMissing(requestUrl) {
  const requestParameters = parseUrl(requestUrl).searchParams;
  const requiredParameters = ['transaction_id', 'coupon_code', ['oid', 'affid']];
  const anyRequiredParameterMissing = requiredParameters.every((p) => {
    if (getType(p) === 'array') return p.some((i) => !isValidValue(requestParameters[i]));
    else return !isValidValue(requestParameters[p]);
  });
  if (anyRequiredParameterMissing) return requiredParameters;
}

function sendConversion(data) {
  const requestUrl = createRequestUrl(data);

  const missingParameters = areThereRequiredParametersMissing(requestUrl);
  if (missingParameters) {
    log({
      Name: 'Everflow',
      Type: 'Message',
      EventName: 'Conversion',
      Message: '🛑 [ERROR] Request was not sent.',
      Reason: 'One or more required parameters are missing: ' + missingParameters.join(' or ')
    });

    return data.gtmOnFailure();
  }

  const requestOptions = {
    method: 'GET'
  };

  return sendHttpRequest(requestUrl, requestOptions)
    .then((response) => {
      if (!data.useOptimisticScenario) {
        if (response.statusCode >= 200 && response.statusCode < 300) return data.gtmOnSuccess();
        else return data.gtmOnFailure();
      }
    })
    .catch((error) => {
      if (!data.useOptimisticScenario) return data.gtmOnFailure();
    });
}

function createRequestUrl(data) {
  const clickId = getClickId(data, eventData);
  const endpoint = parseUrl(data.postbackUrl);
  const nid = endpoint.searchParams.nid;
  let postbackUrl =
    endpoint.origin +
    endpoint.pathname +
    '?nid=' +
    nid +
    (clickId ? '&transaction_id=' + clickId : '');
  const additionalParameters = data.additionalParameters;

  if (additionalParameters) {
    additionalParameters.forEach((parameter) => {
      postbackUrl += '&' + enc(parameter.key) + '=' + enc(parameter.value);
    });
  }

  return postbackUrl;
}

function parseClickIdFromUrl(data, eventData) {
  const url = eventData.page_location || getRequestHeader('referer');
  if (!url) return;
  const urlSearchParams = parseUrl(url).searchParams;
  return urlSearchParams[data.clickIdKey || '_ef_transaction_id'];
}

function getClickId(data, eventData) {
  const clickId = data.hasOwnProperty('clickId')
    ? data.clickId
    : parseClickIdFromUrl(data, eventData) || getCookieValues('ef_transaction_id')[0];
  return clickId;
}

function storeClickId(data, eventData) {
  const clickId = parseClickIdFromUrl(data, eventData);
  if (clickId) {
    const cookieOptions = {
      domain: getCookieDomain(data),
      samesite: data.cookieSameSite || 'none',
      path: '/',
      secure: true,
      httpOnly: !!data.cookieHttpOnly,
      'max-age': 60 * 60 * 24 * (makeInteger(data.cookieExpiration) || 30)
    };
    setCookie('ef_transaction_id', clickId, cookieOptions, false);
  }

  return data.gtmOnSuccess();
}

/*==============================================================================
  Helpers
==============================================================================*/

function shouldExitEarly(data, eventData) {
  const url = eventData.page_location || getRequestHeader('referer');

  if (!isConsentGivenOrNotRequired(data, eventData)) {
    data.gtmOnSuccess();
    return true;
  }

  if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) {
    data.gtmOnSuccess();
    return true;
  }

  if (data.type === 'conversion' && !data.postbackUrl.match('[?&]nid=[^&]+')) {
    log({
      Name: 'Everflow',
      Type: 'Message',
      EventName: 'Conversion',
      Message: '🛑 [ERROR] Malformed Postback URL. Aborting tag execution.',
      Reason:
        "Missing 'nid' parameter. Check your Postback URL in the Everflow UI and use it as is in this tag."
    });
    data.gtmOnFailure();
    return true;
  }
}

function isValidValue(value) {
  const valueType = getType(value);
  return valueType !== 'null' && valueType !== 'undefined' && value !== '' && value === value;
}

function getCookieDomain(data) {
  return !data.cookieDomain || data.cookieDomain === 'auto'
    ? computeEffectiveTldPlusOne(getEventData('page_location') || getRequestHeader('referer')) ||
        'auto'
    : data.cookieDomain;
}

function enc(data) {
  if (['null', 'undefined'].indexOf(getType(data)) !== -1) data = '';
  return encodeUriComponent(makeString(data));
}

function isConsentGivenOrNotRequired(data, eventData) {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}

function log(rawDataToLog) {
  rawDataToLog.TraceId = getRequestHeader('trace-id');
  logToConsole(JSON.stringify(rawDataToLog));
}
