import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Typography,
} from '@mui/material';
import { FC, ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createLocalAudioTrack,
  createLocalVideoTrack,
  LocalAudioTrack,
  LocalVideoTrack,
  LocalParticipant,
} from 'twilio-video';
import { useDevices } from '../hooks';
import { useVideoParticipant } from '../store';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import RestartAlt from '@mui/icons-material/RestartAlt';

interface CallSettingsProps {
  localParticipant: LocalParticipant | undefined;
  onClose: () => void;
  open: boolean;
}

interface Device {
  deviceId: string;
  label: string;
}

interface DeviceSelectorProps {
  devices: Device[];
  handleChange: (e: SelectChangeEvent<string>) => void;
  isOn?: boolean;
  label: string;
  selectedDevice: string;
}

const getDeviceIcon = (deviceType: string, isOn: boolean): ReactNode => {
  switch (deviceType) {
    case 'Camera':
      return isOn ? <VideocamIcon fontSize="large" /> : <VideocamOffIcon fontSize="large" />;
    case 'Microphone':
      return isOn ? <MicIcon fontSize="large" /> : <MicOffIcon fontSize="large" />;
    default:
      return null;
  }
};

const DeviceSelector: FC<DeviceSelectorProps> = ({ devices, selectedDevice, handleChange, label, isOn }) => (
  <Grid container>
    <Grid item xs={10}>
      <FormControl fullWidth margin="normal" variant="outlined">
        <InputLabel>{label}</InputLabel>
        <Select label={label} onChange={handleChange} value={selectedDevice}>
          {devices.map((device) => (
            <MenuItem key={device.deviceId} value={device.deviceId}>
              {device.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Grid>
    <Grid alignItems="center" container item justifyContent="flex-end" xs={2}>
      {getDeviceIcon(label, isOn || false)}
    </Grid>
  </Grid>
);

export const CallSettings: FC<CallSettingsProps> = ({ localParticipant, onClose, open }) => {
  const { audioInputDevices, videoInputDevices, audioOutputDevices } = useDevices();
  const videoRef = useRef<HTMLDivElement | null>(null);
  const { t } = useTranslation();
  const { localTracks, setLocalTracks, selectedSpeaker, setSelectedSpeaker, isMicOpen, isVideoOpen } =
    useVideoParticipant();

  useEffect(() => {
    let localVideoTrackCleanup: LocalVideoTrack | null = null;

    const attachVideo = (newTrack: LocalVideoTrack): void => {
      if (videoRef.current) {
        const videoElement = newTrack.attach();
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';
        videoRef.current.appendChild(videoElement);
      }
    };

    const detachVideo = (): void => {
      if (videoRef.current) {
        videoRef.current.querySelectorAll('video').forEach((v) => v.remove());
      }
    };

    if (open) {
      createLocalVideoTrack()
        .then((newTrack) => {
          attachVideo(newTrack);
          localVideoTrackCleanup = newTrack;
        })
        .catch((error) => console.error('Failed to create video track:', error));
    }

    return () => {
      detachVideo();
      if (localVideoTrackCleanup) {
        localVideoTrackCleanup.stop();
      }
    };
  }, [open]);

  const [camera, setCamera] = useState<string>('');
  const [microphone, setMicrophone] = useState<string>('');
  const [speakers, setSpeakers] = useState<string>(selectedSpeaker || '');

  const updateDevice = async (type: string, deviceId: string): Promise<void> => {
    if (!localParticipant) return;

    let newTrack;
    switch (type) {
      case 'audioInput':
        newTrack = await createLocalAudioTrack({ deviceId: { exact: deviceId } });
        break;
      case 'videoInput':
        newTrack = await createLocalVideoTrack({ deviceId: { exact: deviceId } });
        break;
      default:
        return;
    }

    // Find the existing track of the same type and replace it
    const existingTrackIndex = localTracks.findIndex((track) => track.kind === type.slice(0, -5));
    if (existingTrackIndex !== -1) {
      const existingTrack = localTracks[existingTrackIndex];
      localParticipant.unpublishTrack(existingTrack);
      existingTrack.stop();
      localTracks.splice(existingTrackIndex, 1, newTrack as LocalAudioTrack | LocalVideoTrack);
    } else {
      localTracks.push(newTrack as LocalAudioTrack | LocalVideoTrack);
    }

    localParticipant.publishTrack(newTrack).catch((error) => console.error('Failed to publish track', error));
    setLocalTracks([...localTracks]);
  };

  const handleCameraChange = (e: SelectChangeEvent<string>): void => {
    const selectedCamera = e.target.value;
    setCamera(selectedCamera);
  };

  const handleMicrophoneChange = (e: SelectChangeEvent<string>): void => {
    const selectedMicrophone = e.target.value;
    setMicrophone(selectedMicrophone);
  };

  const handleSpeakersChange = (e: SelectChangeEvent<string>): void => {
    const selectedSpeakers = e.target.value;
    setSpeakers(selectedSpeakers);
  };

  // TODO device labels translated without breaking video call functionality/back end submission
  const deviceConfigs = [
    {
      devices: videoInputDevices,
      handleChange: handleCameraChange,
      isOn: isVideoOpen,
      label: 'Camera',
      selectedDevice: camera,
    },
    {
      devices: audioInputDevices,
      handleChange: handleMicrophoneChange,
      isOn: isMicOpen,
      label: 'Microphone',
      selectedDevice: microphone,
    },
    {
      devices: audioOutputDevices,
      handleChange: handleSpeakersChange,
      label: 'Speakers',
      selectedDevice: speakers,
    },
  ];

  const handleSave = async (): Promise<void> => {
    if (camera) {
      await updateDevice('videoInput', String(camera));
    }
    if (microphone) {
      await updateDevice('audioInput', String(microphone));
    }
    if (speakers) {
      setSelectedSpeaker(String(speakers));
    }
    onClose();
  };

  return (
    <Dialog maxWidth="sm" onClose={onClose} open={open}>
      <DialogTitle>{t('callSettings.callSettings')}</DialogTitle>
      <DialogContent>
        {/* Camera preview */}
        <Box
          ref={videoRef}
          sx={{
            height: '100%',
            width: '100%',
          }}
        />
        {/* Device selectors */}
        {deviceConfigs.map((config, index) => (
          <DeviceSelector
            key={index}
            devices={config.devices}
            handleChange={config.handleChange}
            isOn={config.isOn}
            label={config.label}
            selectedDevice={config.selectedDevice}
          />
        ))}
        <Typography sx={{ mt: 2 }}>{t('callSettings.technicalIssues')}</Typography>
        <Button startIcon={<RestartAlt />} variant="text">
          {t('callSettings.restartCall')}
        </Button>
      </DialogContent>
      <DialogActions sx={{ alignItems: 'center', justifyContent: 'flex-end', padding: '16px 24px' }}>
        <Button onClick={onClose} sx={{ marginRight: 1 }} variant="text">
          {t('callSettings.cancel')}
        </Button>
        <Button onClick={handleSave} variant="contained">
          {t('callSettings.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
