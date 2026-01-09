const BigQuery = require('BigQuery');
const computeEffectiveTldPlusOne = require('computeEffectiveTldPlusOne');
const encodeUriComponent = require('encodeUriComponent');
const getAllEventData = require('getAllEventData');
const getCookieValues = require('getCookieValues');
const getContainerVersion = require('getContainerVersion');
const getEventData = require('getEventData');
const getRequestHeader = require('getRequestHeader');
const getTimestampMillis = require('getTimestampMillis');
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
      Message: 'Request was not sent.',
      Reason: 'One or more required parameters are missing: ' + missingParameters.join(' or ')
    });

    return data.gtmOnFailure();
  }

  const requestOptions = {
    method: 'GET'
  };

  log({
    Name: 'Everflow',
    Type: 'Request',
    EventName: 'Conversion',
    RequestMethod: requestOptions.method,
    RequestUrl: requestUrl
  });

  return sendHttpRequest(requestUrl, requestOptions)
    .then((response) => {
      log({
        Name: 'Everflow',
        Type: 'Response',
        EventName: 'Conversion',
        ResponseStatusCode: response.statusCode,
        ResponseHeaders: response.headers,
        ResponseBody: response.body
      });
      if (!data.useOptimisticScenario) {
        if (response.statusCode >= 200 && response.statusCode < 300) return data.gtmOnSuccess();
        else return data.gtmOnFailure();
      }
    })
    .catch((error) => {
      log({
        Name: 'Everflow',
        Type: 'Message',
        EventName: 'Conversion',
        Message: 'API call failed or timed out',
        Reason: JSON.stringify(error)
      });
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

  if (data.type === 'conversion' && !data.postbackUrl.match('nid=[^&]+')) {
    log({
      Name: 'Everflow',
      Type: 'Message',
      Message: 'Malformed Postback URL. Aborting tag execution.',
      Reason:
        "Missing 'nid' parameter. Check your Postback URL in the Everflow UI and use it as is in this tag."
    });
    data.gtmOnFailure();
    return true;
  }
}

function isValidValue(value) {
  const valueType = getType(value);
  return valueType !== 'null' && valueType !== 'undefined' && value !== '';
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
  const logDestinationsHandlers = {};
  if (determinateIsLoggingEnabled()) logDestinationsHandlers.console = logConsole;
  if (determinateIsLoggingEnabledForBigQuery()) logDestinationsHandlers.bigQuery = logToBigQuery;

  rawDataToLog.TraceId = getRequestHeader('trace-id');

  const keyMappings = {
    // No transformation for Console is needed.
    bigQuery: {
      Name: 'tag_name',
      Type: 'type',
      TraceId: 'trace_id',
      EventName: 'event_name',
      RequestMethod: 'request_method',
      RequestUrl: 'request_url',
      RequestBody: 'request_body',
      ResponseStatusCode: 'response_status_code',
      ResponseHeaders: 'response_headers',
      ResponseBody: 'response_body'
    }
  };

  for (const logDestination in logDestinationsHandlers) {
    const handler = logDestinationsHandlers[logDestination];
    if (!handler) continue;

    const mapping = keyMappings[logDestination];
    const dataToLog = mapping ? {} : rawDataToLog;

    if (mapping) {
      for (const key in rawDataToLog) {
        const mappedKey = mapping[key] || key;
        dataToLog[mappedKey] = rawDataToLog[key];
      }
    }

    handler(dataToLog);
  }
}

function logConsole(dataToLog) {
  logToConsole(JSON.stringify(dataToLog));
}

function logToBigQuery(dataToLog) {
  const connectionInfo = {
    projectId: data.logBigQueryProjectId,
    datasetId: data.logBigQueryDatasetId,
    tableId: data.logBigQueryTableId
  };

  dataToLog.timestamp = getTimestampMillis();

  ['request_body', 'response_headers', 'response_body'].forEach((p) => {
    dataToLog[p] = JSON.stringify(dataToLog[p]);
  });

  BigQuery.insert(connectionInfo, [dataToLog], { ignoreUnknownValues: true });
}

function determinateIsLoggingEnabled() {
  const containerVersion = getContainerVersion();
  const isDebug = !!(
    containerVersion &&
    (containerVersion.debugMode || containerVersion.previewMode)
  );

  if (!data.logType) {
    return isDebug;
  }

  if (data.logType === 'no') {
    return false;
  }

  if (data.logType === 'debug') {
    return isDebug;
  }

  return data.logType === 'always';
}

function determinateIsLoggingEnabledForBigQuery() {
  if (data.bigQueryLogType === 'no') return false;
  return data.bigQueryLogType === 'always';
}
