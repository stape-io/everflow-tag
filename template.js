const BigQuery = require('BigQuery');
const encodeUriComponent = require('encodeUriComponent');
const getAllEventData = require('getAllEventData');
const getContainerVersion = require('getContainerVersion');
const getRequestHeader = require('getRequestHeader');
const getTimestampMillis = require('getTimestampMillis');
const JSON = require('JSON');
const logToConsole = require('logToConsole');
const makeString = require('makeString');
const makeInteger = require('makeInteger');
const setCookie = require('setCookie');
const parseUrl = require('parseUrl');
const sendHttpRequest = require('sendHttpRequest');
const sendPixelFromBrowser = require('sendPixelFromBrowser');

/*==============================================================================
==============================================================================*/

const eventData = getAllEventData();

if(checkGuardClauses(data,eventData)) return;

if(data.type === 'pageview') return storeClickId(data.clickIdKey);

sendConversion(data);

if (data.useOptimisticScenario) {
  return data.gtmOnSuccess();
}

/*==============================================================================
  Vendor related functions
==============================================================================*/

function sendConversion(data) {
  const goal = data.conversionId;
  const clickId = data.clickId;
  let requestUrl = '';
  const requestOptions = {
    method: "GET"
  };
  
  log({
    Name: 'Everflow',
    Type: 'Request',
    EventName: 'Conversion',
    RequestMethod: requestOptions.method,
    RequestUrl: requestUrl,
    RequestBody: ''
  });
  
  return sendHttpRequest(requestUrl, requestOptions)
  .then(response => {
       log({
        Name: 'Everflow',
        Type: 'Response',
        EventName: 'Conversion',
        ResponseStatusCode: response.statusCode,
        ResponseHeaders: response.headers,
        ResponseBody: response.body
      });  
    
    if(response.statusCode !== 200) {
      return data.gtmOnFailure();
    }
    else {
      return data.gtmOnSuccess();
    }
  })
  .catch(error => {
       log({
        Name: 'Everflow',
        Type: 'Message',
        EventName: 'Conversion',
        Message: 'API call failed or timed out',
        Reason: error
      });
    return data.gtmOnFailure();
  });
}

function storeClickId(key){  
  const url = eventData.page_location || getRequestHeader('referer');
  const urlSearchParams = parseUrl(url).searchParams;
  const clickId = urlSearchParams[data.clickIdKey];
 
  if (!url) return data.gtmOnSuccess();

  const cookieOptions = {
    domain: data.cookieDomain || 'auto',
    samesite: 'Lax',
    path: '/',
    secure: true,
    httpOnly: !!data.cookieHttpOnly,
    'max-age': 60 * 60 * 24 * (makeInteger(data.cookieExpiration) || 365)
  };

  if (clickId) setCookie(data.clickIdKey, clickId, cookieOptions, false);

  return data.gtmOnSuccess();  
}


/*==============================================================================
  Helpers
==============================================================================*/

function checkGuardClauses(data,eventData) {
  const url = eventData.page_location || getRequestHeader('referer');

  if (!isConsentGivenOrNotRequired(data, eventData)) {
    return data.gtmOnSuccess();
  }

  if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) {
    return data.gtmOnSuccess();
  }
}

function enc(data) {
  if (data === undefined || data === null) data = '';
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