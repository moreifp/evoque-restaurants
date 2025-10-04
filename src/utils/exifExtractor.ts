import exifr from 'exifr';

export interface PhotoLocation {
  latitude: number;
  longitude: number;
  timestamp?: Date;
}

export const extractGPSFromImage = async (file: File): Promise<PhotoLocation | null> => {
  try {
    console.log('Attempting to extract GPS from:', {
      name: file.name,
      type: file.type,
      size: file.size
    });

    // Parse EXIF data from the image with comprehensive options
    const exifData = await exifr.parse(file, {
      gps: true,
      tiff: true,
      exif: true,
      translateKeys: true,
      translateValues: true,
      reviveValues: true,
      sanitize: true,
      mergeOutput: true
    });

    console.log('Full EXIF data extracted:', exifData);

    if (!exifData) {
      console.warn('⚠️ No EXIF data found in image. This can happen if:');
      console.warn('  - The photo was edited/compressed');
      console.warn('  - Location services were disabled when photo was taken');
      console.warn('  - The browser stripped EXIF data for privacy');
      return null;
    }

    const { latitude, longitude, GPSLatitude, GPSLongitude, DateTimeOriginal } = exifData;

    // Try both parsed coordinates and raw GPS data
    const lat = latitude || GPSLatitude;
    const lng = longitude || GPSLongitude;

    if (!lat || !lng) {
      console.warn('⚠️ GPS coordinates not found in EXIF data');
      console.log('Available EXIF keys:', Object.keys(exifData));
      return null;
    }

    console.log('✅ Successfully extracted GPS coordinates:', { lat, lng });

    return {
      latitude: lat,
      longitude: lng,
      timestamp: DateTimeOriginal || undefined
    };
  } catch (error) {
    console.error('❌ Error extracting GPS data:', error);
    console.error('This might be due to:');
    console.error('  - Unsupported image format');
    console.error('  - Corrupted EXIF data');
    console.error('  - Browser limitations');
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
