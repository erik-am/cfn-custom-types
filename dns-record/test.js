const { createChangeSets, determineHostedZoneName } = require('./index.js');

const hostedZones = [
  { Name: 'testing.com.', Id: 'ZONE1' },
  { Name: 'unittesting.com.', Id: 'ZONE2' },
];

describe('Change set creation', () => {
  it('can handle empty list', () => {
    // Arrange
    const cfnRecords = [];
    // Act
    const changeSets = createChangeSets(cfnRecords, [], hostedZones);

    // Assert
    expect(changeSets).toEqual([]);
  });

  it('can handle single record', () => {
    // Arrange
    const cfnRecords = [
      {
        Name: 'www.testing.com.',
        Type: 'A',
        ResourceRecords: [{ Value: '0.0.0.0' }],
      },
    ];
    // Act
    const changeSets = createChangeSets(cfnRecords, [], hostedZones);

    // Assert
    expect(changeSets).toEqual([
      {
        HostedZoneId: 'ZONE1',
        ChangeBatch: {
          Changes: [
            {
              Action: 'UPSERT',
              ResourceRecordSet: {
                Name: 'www.testing.com.',
                Type: 'A',
                ResourceRecords: [{ Value: '0.0.0.0' }],
              },
            },
          ],
        },
      },
    ]);
  });

  it('can handle multiple records', () => {
    // Arrange
    const cfnRecords = [
      {
        Name: 'testing.com.',
        Type: 'A',
        ResourceRecords: [{ Value: '0.0.0.0' }],
      },
      {
        Name: 'www.testing.com.',
        Type: 'A',
        ResourceRecords: [{ Value: '0.0.0.0' }],
      },
    ];
    // Act
    const changeSets = createChangeSets(cfnRecords, [], hostedZones);

    // Assert
    expect(changeSets).toEqual([
      {
        HostedZoneId: 'ZONE1',
        ChangeBatch: {
          Changes: [
            {
              Action: 'UPSERT',
              ResourceRecordSet: {
                Name: 'testing.com.',
                Type: 'A',
                ResourceRecords: [{ Value: '0.0.0.0' }],
              },
            },
            {
              Action: 'UPSERT',
              ResourceRecordSet: {
                Name: 'www.testing.com.',
                Type: 'A',
                ResourceRecords: [{ Value: '0.0.0.0' }],
              },
            },
          ],
        },
      },
    ]);
  });

  it('can handle multiple hosted zones', () => {
    // Arrange
    const cfnRecords = [
      {
        Name: 'testing.com.',
        Type: 'A',
        ResourceRecords: [{ Value: '0.0.0.0' }],
      },
      {
        Name: 'unittesting.com.',
        Type: 'CNAME',
        ResourceRecords: [{ Value: 'testing.com' }],
      },
    ];
    // Act
    const changeSets = createChangeSets(cfnRecords, [], hostedZones);

    // Assert
    expect(changeSets).toEqual([
      {
        HostedZoneId: 'ZONE1',
        ChangeBatch: {
          Changes: [
            {
              Action: 'UPSERT',
              ResourceRecordSet: {
                Name: 'testing.com.',
                Type: 'A',
                ResourceRecords: [{ Value: '0.0.0.0' }],
              },
            },
          ],
        },
      },
      {
        HostedZoneId: 'ZONE2',
        ChangeBatch: {
          Changes: [
            {
              Action: 'UPSERT',
              ResourceRecordSet: {
                Name: 'unittesting.com.',
                Type: 'CNAME',
                ResourceRecords: [{ Value: 'testing.com' }],
              },
            },
          ],
        },
      },
    ]);
  });

  it('can delete old records', () => {
    // Arrange
    const cfnRecords = [];
    const oldCfnRecords = [
      {
        Name: 'testing.com.',
        Type: 'A',
        ResourceRecords: [{ Value: '0.0.0.0' }],
      },
    ];
    // Act
    const changeSets = createChangeSets(cfnRecords, oldCfnRecords, hostedZones);

    // Assert
    expect(changeSets).toEqual([
      {
        HostedZoneId: 'ZONE1',
        ChangeBatch: {
          Changes: [
            {
              Action: 'DELETE',
              ResourceRecordSet: {
                Name: 'testing.com.',
                Type: 'A',
                ResourceRecords: [{ Value: '0.0.0.0' }],
              },
            },
          ],
        },
      },
    ]);
  });

  it('throws an exception for unknown hosted zone', () => {
    const cfnRecords = [
      {
        Name: 'dontknow.com.',
        Type: 'A',
        ResourceRecords: [{ Value: '0.0.0.0' }],
      },
    ];
    expect(() => createChangeSets(cfnRecords, [], hostedZones)).toThrowError(
      /dontknow\.com/,
    );
  });

  it('can handle complex updates and deletes', () => {
    // Arrange
    const cfnRecords = [
      {
        Name: 'testing.com.',
        Type: 'A',
        ResourceRecords: [{ Value: '123.123.123.123' }],
      },
      {
        Name: 'unittesting.com.',
        Type: 'CNAME',
        ResourceRecords: [{ Value: '0.0.0.0' }],
      },
      {
        Name: 'unittesting.com.',
        Type: 'MX',
        ResourceRecords: [{ Value: '0.0.0.0' }],
      },
    ];
    const oldCfnRecords = [
      {
        Name: 'testing.com.',
        Type: 'A',
        ResourceRecords: [{ Value: '0.0.0.0' }],
      },
      {
        Name: 'unittesting.com.',
        Type: 'A',
        ResourceRecords: [{ Value: '1.2.3.4' }],
      },
      {
        Name: 'unittesting.com.',
        Type: 'CNAME',
        ResourceRecords: [{ Value: '0.0.0.0' }],
      },
    ];
    // Act
    const changeSets = createChangeSets(cfnRecords, oldCfnRecords, hostedZones);

    // Assert
    expect(changeSets).toEqual([
      {
        HostedZoneId: 'ZONE2',
        ChangeBatch: {
          Changes: [
            {
              Action: 'DELETE',
              ResourceRecordSet: {
                Name: 'unittesting.com.',
                Type: 'A',
                ResourceRecords: [{ Value: '1.2.3.4' }],
              },
            },
            {
              Action: 'UPSERT',
              ResourceRecordSet: {
                Name: 'unittesting.com.',
                Type: 'CNAME',
                ResourceRecords: [{ Value: '0.0.0.0' }],
              },
            },
            {
              Action: 'UPSERT',
              ResourceRecordSet: {
                Name: 'unittesting.com.',
                Type: 'MX',
                ResourceRecords: [{ Value: '0.0.0.0' }],
              },
            },
          ],
        },
      },
      {
        HostedZoneId: 'ZONE1',
        ChangeBatch: {
          Changes: [
            {
              Action: 'UPSERT',
              ResourceRecordSet: {
                Name: 'testing.com.',
                Type: 'A',
                ResourceRecords: [{ Value: '123.123.123.123' }],
              },
            },
          ],
        },
      },
    ]);
  });

  it('can handle boolean strings coming from YAML', () => {
    // Arrange
    const cfnRecords = [
      {
        Name: 'www.testing.com.',
        Type: 'A',
        AliasTarget: {
          HostedZoneId: 'Z2FDTNDATAQYW2',
          DNSName: 'abcd.cloudfront.net.',
          EvaluateTargetHealth: 'false',
        },
      },
    ];
    // Act
    const changeSets = createChangeSets(cfnRecords, [], hostedZones);

    // Assert
    expect(changeSets).toEqual([
      {
        HostedZoneId: 'ZONE1',
        ChangeBatch: {
          Changes: [
            {
              Action: 'UPSERT',
              ResourceRecordSet: {
                Name: 'www.testing.com.',
                Type: 'A',
                AliasTarget: {
                  HostedZoneId: 'Z2FDTNDATAQYW2',
                  DNSName: 'abcd.cloudfront.net.',
                  EvaluateTargetHealth: false,
                },
              },
            },
          ],
        },
      },
    ]);
  });

  it('can handle boolean strings coming from YAML when deleting', () => {
    // Arrange
    const cfnRecords = [];
    const oldCfnRecords = [
      {
        Name: 'www.testing.com.',
        Type: 'A',
        AliasTarget: {
          HostedZoneId: 'Z2FDTNDATAQYW2',
          DNSName: 'abcd.cloudfront.net.',
          EvaluateTargetHealth: 'true',
        },
      },
    ];
    // Act
    const changeSets = createChangeSets(cfnRecords, oldCfnRecords, hostedZones);

    // Assert
    expect(changeSets).toEqual([
      {
        HostedZoneId: 'ZONE1',
        ChangeBatch: {
          Changes: [
            {
              Action: 'DELETE',
              ResourceRecordSet: {
                Name: 'www.testing.com.',
                Type: 'A',
                AliasTarget: {
                  HostedZoneId: 'Z2FDTNDATAQYW2',
                  DNSName: 'abcd.cloudfront.net.',
                  EvaluateTargetHealth: true,
                },
              },
            },
          ],
        },
      },
    ]);
  });
});

describe('Determinining hosted zone names', () => {
  it('can handle root names', () => {
    expect(determineHostedZoneName('testing.com.')).toEqual('testing.com.');
  });
  it('can handle missing trailing dot', () => {
    expect(determineHostedZoneName('testing.com')).toEqual('testing.com.');
  });
  it('can handle subdomains', () => {
    expect(determineHostedZoneName('www.testing.com.')).toEqual('testing.com.');
  });
  it('can handle subsubdomains', () => {
    expect(determineHostedZoneName('a.b.testing.com.')).toEqual('testing.com.');
  });
});
