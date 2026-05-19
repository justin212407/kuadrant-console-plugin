import * as React from 'react';
import Helmet from 'react-helmet';
import {
  PageSection,
  Title,
  TextInput,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Form,
  Radio,
  Button,
  ActionGroup,
  ExpandableSection,
  Label,
  LabelGroup,
} from '@patternfly/react-core';
import { TimesIcon } from '@patternfly/react-icons';
import { useTranslation } from 'react-i18next';
import './kuadrant.css';
import {
  ResourceYAMLEditor,
  getGroupVersionKindForResource,
  useK8sModel,
  useK8sWatchResource,
  K8sResourceCommon,
  useActiveNamespace,
} from '@openshift-console/dynamic-plugin-sdk';
import { useNavigate, useLocation } from 'react-router-dom-v5-compat';
import { Gateway } from './gateway/types';
import GatewaySelect from './gateway/GatewaySelect';
import * as yaml from 'js-yaml';
import KuadrantCreateUpdate from './KuadrantCreateUpdate';
import { handleCancel } from '../utils/cancel';
import { resourceGVKMapping } from '../utils/resources';
import AddLimitModal from './ratelimitpolicy/AddLimitModal';

interface LimitConfig {
  rates: Array<{ limit: number; window: string }>;
  counters?: string[];
  when?: string[];
}

interface ModalLimitConfig {
  rates: Array<{ duration: number; limit: number; unit: 'second' | 'minute' | 'hour' | 'day' }>;
}

const KuadrantTokenRateLimitPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [policyName, setPolicyName] = React.useState('');
  const [selectedGateway, setSelectedGateway] = React.useState<Gateway>({
    name: '',
    namespace: '',
  });
  const [limits, setLimits] = React.useState<Record<string, LimitConfig>>({});
  const [yamlInput, setYamlInput] = React.useState<Record<string, unknown>>({});
  const [creationTimestamp, setCreationTimestamp] = React.useState('');
  const [resourceVersion, setResourceVersion] = React.useState('');
  const [create, setCreate] = React.useState(true);
  const [formDisabled, setFormDisabled] = React.useState(false);
  const [selectedNamespace] = useActiveNamespace();
  const location = useLocation();
  const pathSplit = location.pathname.split('/');
  const nameEdit = pathSplit[6];
  const namespaceEdit = pathSplit[3];
  const [limitsExpanded, setLimitsExpanded] = React.useState(false);
  const [isAddLimitModalOpen, setIsAddLimitModalOpen] = React.useState(false);
  const [newLimit, setNewLimit] = React.useState<ModalLimitConfig>({
    rates: [{ duration: 60, limit: 100, unit: 'minute' }],
  });
  const [limitName, setLimitName] = React.useState('');

  const addLimit = (name: string, config: LimitConfig) =>
    setLimits((prev) => ({ ...prev, [name]: config }));

  const removeLimit = (name: string) =>
    setLimits((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });

  const createTokenRateLimitPolicy = () => {
    return {
      apiVersion:
        resourceGVKMapping['TokenRateLimitPolicy'].group +
        '/' +
        resourceGVKMapping['TokenRateLimitPolicy'].version,
      kind: resourceGVKMapping['TokenRateLimitPolicy'].kind,
      metadata: {
        name: policyName,
        namespace: selectedNamespace,
        ...(creationTimestamp && { creationTimestamp }),
        ...(resourceVersion && { resourceVersion }),
      },
      spec: {
        targetRef: {
          group: 'gateway.networking.k8s.io',
          kind: 'Gateway',
          name: selectedGateway.name,
        },
        ...(Object.keys(limits).length > 0 && { limits }),
      },
    };
  };

  const tokenRateLimitPolicy = createTokenRateLimitPolicy();
  const tokenRateLimitPolicyGVK = getGroupVersionKindForResource({
    apiVersion: `${resourceGVKMapping['TokenRateLimitPolicy'].group}/${
      resourceGVKMapping['TokenRateLimitPolicy'].version}`,
    kind: resourceGVKMapping['TokenRateLimitPolicy'].kind,
  });
  const [tokenRateLimitPolicyModel] = useK8sModel({
    group: tokenRateLimitPolicyGVK.group,
    version: tokenRateLimitPolicyGVK.version,
    kind: tokenRateLimitPolicyGVK.kind,
  });

  const navigate = useNavigate();

  interface TokenRateLimitPolicyEdit extends K8sResourceCommon {
    spec?: {
      targetRef?: {
        group?: string;
        kind?: string;
        name?: string;
      };
      limits?: Record<string, LimitConfig>;
    };
  }

  let tokenRateLimitResource = null;
  if (location.pathname.includes('edit') && nameEdit) {
    tokenRateLimitResource = {
      groupVersionKind: tokenRateLimitPolicyGVK,
      isList: false,
      name: nameEdit,
      namespace: namespaceEdit,
    };
  }

  const [tokenRateLimitData, tokenRateLimitLoaded, tokenRateLimitError] =
    tokenRateLimitResource
      ? useK8sWatchResource(tokenRateLimitResource)
      : [null, false, null];

  React.useEffect(() => {
    if (tokenRateLimitLoaded && !tokenRateLimitError) {
      if (!Array.isArray(tokenRateLimitData)) {
        const tokenRateLimitPolicyUpdate = tokenRateLimitData as TokenRateLimitPolicyEdit;
        setCreationTimestamp(tokenRateLimitPolicyUpdate.metadata.creationTimestamp);
        setResourceVersion(tokenRateLimitPolicyUpdate.metadata.resourceVersion);
        setFormDisabled(true);
        setCreate(false);
        setPolicyName(tokenRateLimitPolicyUpdate.metadata?.name || '');
        setSelectedGateway({
          name: tokenRateLimitPolicyUpdate.spec?.targetRef?.name || '',
          namespace: tokenRateLimitPolicyUpdate.metadata?.namespace || '',
        });
        setLimits(tokenRateLimitPolicyUpdate.spec?.limits || {});
      }
    } else if (tokenRateLimitError) {
      console.error('Failed to fetch the resource:', tokenRateLimitError);
    }
  }, [tokenRateLimitData, tokenRateLimitLoaded, tokenRateLimitError]);

  const handleYAMLChange = (yamlInput: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsedYaml = yaml.load(yamlInput) as Record<string, any>;
      setPolicyName(parsedYaml.metadata?.name || '');
      setSelectedGateway({
        name: parsedYaml.spec?.targetRef?.name || '',
        namespace: parsedYaml.metadata?.namespace || '',
      });
      setLimits(parsedYaml.spec?.limits || {});
    } catch (e) {
      console.error(t('Error parsing YAML:'), e);
    }
  };

  React.useEffect(() => {
    setYamlInput(createTokenRateLimitPolicy());
  }, [policyName, selectedGateway, limits]);

  const handlePolicyChange = (_event, policy: string) => {
    setPolicyName(policy);
  };

  const handleCancelResource = () => {
    handleCancel(selectedNamespace, tokenRateLimitPolicy, navigate);
  };

  const handleOpenLimitModal = () => {
    setNewLimit({ rates: [{ duration: 60, limit: 100, unit: 'minute' }] });
    setLimitName('');
    setIsAddLimitModalOpen(true);
  };

  const handleCloseLimitModal = () => {
    setIsAddLimitModalOpen(false);
  };

  const handleSaveLimit = () => {
    const rate = newLimit.rates?.[0];
    if (!limitName || !rate) {
      return;
    }

    const unitSuffixMap = {
      second: 's',
      minute: 'm',
      hour: 'h',
      day: 'd',
    };

    const window = `${rate.duration}${unitSuffixMap[rate.unit]}`;
    addLimit(limitName, { rates: [{ limit: rate.limit, window }] });
    setIsAddLimitModalOpen(false);
  };

  const isFormValid = !!(policyName && selectedGateway.name);

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Create TokenRateLimit Policy')}</title>
      </Helmet>
      <PageSection hasBodyWrapper={false} className="pf-m-no-padding">
        <div className="co-m-nav-title">
          <Title headingLevel="h1">
            {create ? t('Create TokenRateLimit Policy') : t('Edit TokenRateLimit Policy')}
          </Title>
          <p className="help-block">{t('TokenRateLimitPolicy')}</p>
        </div>
        <FormGroup
          className="kuadrant-editor-toggle"
          role="radiogroup"
          isInline
          fieldId="create-type-radio-group"
          label={t('Configure via')}
        >
          <Radio
            name="create-type-radio"
            label={t('Form view')}
            id="form-view"
            isChecked={createView === 'form'}
            onChange={() => setCreateView('form')}
          />
          <Radio
            name="create-type-radio"
            label={t('YAML view')}
            id="yaml-view"
            isChecked={createView === 'yaml'}
            onChange={() => setCreateView('yaml')}
          />
        </FormGroup>
      </PageSection>
      {createView === 'form' ? (
        <PageSection hasBodyWrapper={false}>
          <Form className="co-m-pane__form">
            <FormGroup label={t('Policy Name')} isRequired fieldId="policy-name">
              <TextInput
                isRequired
                type="text"
                id="policy-name"
                name="policy-name"
                value={policyName}
                onChange={handlePolicyChange}
                isDisabled={formDisabled}
                validated={policyName ? 'default' : 'error'}
                placeholder={t('Policy name')}
              />
              {!policyName && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">{t('oidcPolicy.policyNameError')}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
            <GatewaySelect selectedGateway={selectedGateway} onChange={setSelectedGateway} />
            <ExpandableSection
              toggleText={t('tokenRateLimitPolicy.limits')}
              className="pf-u-mb-0"
              isExpanded={limitsExpanded}
              onToggle={() => setLimitsExpanded(!limitsExpanded)}
            >
              {Object.keys(limits).length === 0 ? (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>{t('tokenRateLimitPolicy.noLimits')}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              ) : (
                <LabelGroup numLabels={5}>
                  {Object.entries(limits).map(([name, config]) => (
                    <Label
                      key={name}
                      color="blue"
                      onClose={() => removeLimit(name)}
                      closeBtnAriaLabel={t('tokenRateLimitPolicy.removeLimit')}
                      closeBtnIcon={<TimesIcon />}
                    >
                      <strong>{name}</strong>{' '}
                      {config.rates?.map((rate, index) => (
                        <span key={`${name}-${index}`}>
                          {t('tokenRateLimitPolicy.rateDisplay', {
                            limit: rate.limit,
                            window: rate.window,
                          })}{' '}
                        </span>
                      ))}
                    </Label>
                  ))}
                </LabelGroup>
              )}
              <Button variant="secondary" onClick={handleOpenLimitModal}>
                {t('tokenRateLimitPolicy.addLimit')}
              </Button>
            </ExpandableSection>
            <ActionGroup className="pf-u-mt-0">
              <KuadrantCreateUpdate
                model={tokenRateLimitPolicyModel}
                resource={tokenRateLimitPolicy}
                policyType="tokenratelimit"
                navigate={navigate}
                validation={isFormValid}
              />
              <Button variant="link" onClick={handleCancelResource}>
                {t('Cancel')}
              </Button>
            </ActionGroup>
          </Form>
        </PageSection>
      ) : (
        <React.Suspense fallback={<div>{t('Loading...')}</div>}>
          <ResourceYAMLEditor
            initialResource={yamlInput}
            header={t('Create TokenRateLimit Policy')}
            create={create}
            onChange={handleYAMLChange}
          ></ResourceYAMLEditor>
        </React.Suspense>
      )}
      <AddLimitModal
        isOpen={isAddLimitModalOpen}
        onClose={handleCloseLimitModal}
        newLimit={newLimit}
        setNewLimit={setNewLimit}
        rateName={limitName}
        setRateName={setLimitName}
        handleSave={handleSaveLimit}
      />
    </>
  );
};

export default KuadrantTokenRateLimitPolicyCreatePage;
