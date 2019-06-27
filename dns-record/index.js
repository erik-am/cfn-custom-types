const AWS = require('aws-sdk');
const CfnLambda = require('cfn-lambda');
const union = require('lodash.union');

exports.handler = CfnLambda({
  AsyncCreate: async CfnRequestParams => {
    await updateDNS(CfnRequestParams.Records);
  },
  AsyncUpdate: async (
    RequestPhysicalID,
    CfnRequestParams,
    OldCfnRequestParams,
  ) => {
    await updateDNS(CfnRequestParams.Records, OldCfnRequestParams.Records);
  },
  AsyncDelete: async (RequestPhysicalID, CfnRequestParams) => {
    await updateDNS([], CfnRequestParams.Records);
  },
});

const updateDNS = async (newRecords, oldRecords = []) => {
  const route53 = new AWS.Route53();
  const response = await route53.listHostedZones().promise();
  const changeSets = createChangeSets(
    newRecords,
    oldRecords,
    response.HostedZones,
  );
  await Promise.all(
    changeSets.map(changeSet =>
      route53.changeResourceRecordSets(changeSet).promise(),
    ),
  );
};

const createChangeSets = (newRecords, oldRecords, hostedZones) => {
  fixBooleans(newRecords);
  fixBooleans(oldRecords);
  const groupedRecordsToUpsert = groupAndGiveAction(
    newRecords,
    'UPSERT',
    hostedZones,
  );

  const isMissing = r =>
    newRecords.filter(r2 => r.Name === r2.Name && r.Type === r2.Type).length ===
    0;
  const recordsToDelete = oldRecords.filter(r => isMissing(r));
  const groupedRecordsToDelete = groupAndGiveAction(
    recordsToDelete,
    'DELETE',
    hostedZones,
  );

  const changesPerHostedZone = mergeRecords(
    groupedRecordsToDelete,
    groupedRecordsToUpsert,
  );

  return Object.keys(changesPerHostedZone).map(hostedZoneId => {
    return {
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Changes: changesPerHostedZone[hostedZoneId],
      },
    };
  });
};

// yaml doesn't support booleans, so we convert the string value to a boolean, if the property exists
const fixBooleans = records => {
  records.forEach(resourceRecordSet => {
    if (
      resourceRecordSet &&
      resourceRecordSet.AliasTarget &&
      resourceRecordSet.AliasTarget.EvaluateTargetHealth
    ) {
      resourceRecordSet.AliasTarget.EvaluateTargetHealth =
        resourceRecordSet.AliasTarget.EvaluateTargetHealth === 'true'
          ? true
          : false;
    }
  });
};

const groupAndGiveAction = (records, action, hostedZones) => {
  const groupedRecords = groupRecordsOnHostedZoneId(records, hostedZones);
  Object.keys(groupedRecords).forEach(hostedZoneId => {
    groupedRecords[hostedZoneId] = groupedRecords[hostedZoneId].map(y => {
      return { Action: action, ResourceRecordSet: y };
    });
  });
  return groupedRecords;
};

const mergeRecords = (a, b) =>
  union(Object.keys(a), Object.keys(b))
    .map(k => {
      return {
        [k]: (a[k] || []).concat(b[k] || []),
      };
    })
    .reduce((acc, hz) => {
      return Object.assign(acc, hz);
    }, {});

const groupRecordsOnHostedZoneId = (records, hostedZones) =>
  records
    .map(r => {
      return { hostedZoneName: determineHostedZoneName(r.Name), ...r };
    })
    .reduce((acc, { hostedZoneName, ...r }) => {
      const hostedZoneId = fromNameToId(hostedZoneName, hostedZones);
      const curr = acc[hostedZoneId];
      return { ...acc, [hostedZoneId]: curr ? [...curr, r] : [r] };
    }, {});

const fromNameToId = (hostedZoneName, hostedZones) => {
  const filteredHostedZones = hostedZones.filter(
    z => z.Name === hostedZoneName,
  );
  if (filteredHostedZones.length === 0) {
    throw new Error(`Hosted zone ${hostedZoneName} could not be found.`);
  }
  return filteredHostedZones[0].Id;
};

// determine hosted zones based on DNS record name
const determineHostedZoneName = recordName => {
  // make sure the trailing dot is always there
  recordName = recordName.substr(-1, 1) === '.' ? recordName : `${recordName}.`;
  // get the last segment (without subdomains) as that will be equal to the hosted zone name
  const segments = recordName.split('.');
  const hostedZoneName = `${segments[segments.length - 3]}.${
    segments[segments.length - 2]
  }.`;
  return hostedZoneName;
};

// exports for unit testing
exports.createChangeSets = createChangeSets;
exports.determineHostedZoneName = determineHostedZoneName;
