import exifr from 'exifr';

export interface PhotoLocation {
  latitude: number;
  longitude: number;
  timestamp?: Date;
}

export const extractGPSFromImage = async (file: File): Promise<PhotoLocation | null> => {
  try {
    // Parse EXIF data from the image
    const exifData = await exifr.parse(file, {
      gps: true,
      pick: ['latitude', 'longitude', 'DateTimeOriginal']
    });

    if (!exifData) {
      console.log('No EXIF data found in image');
      return null;
    }

    const { latitude, longitude, DateTimeOriginal } = exifData;

    if (!latitude || !longitude) {
      console.log('No GPS coordinates found in EXIF data');
      return null;
    }

    console.log('Extracted GPS coordinates:', { latitude, longitude });

    return {
      latitude,
      longitude,
      timestamp: DateTimeOriginal || undefined
    };
  } catch (error) {
    console.error('Error extracting GPS data:', error);
    return null;
  }
};

export const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
    );
    
    if (!response.ok) {
      throw new Error('Geocoding failed');
    }

    const data = await response.json();
    return data.display_name || null;
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    return null;
  }
};
