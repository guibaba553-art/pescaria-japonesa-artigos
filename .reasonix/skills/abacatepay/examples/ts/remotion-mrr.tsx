import React from 'react';
import { Folder, staticFile, continueRender, delayRender } from 'remotion';
import { Composition, getInputProps } from 'remotion';
import { getMRR } from './mrr';

// Assuming MRR data structure: { months: [{ month: 'Jan', value: 1000 }, ...] }

const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MRRChart"
        component={MRRChart}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};

const MRRChart: React.FC = () => {
  const [mrrData, setMrrData] = React.useState<any>(null);

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await getMRR();
        setMrrData(data);
      } catch (error) {
        console.error('Error fetching MRR:', error);
      }
    };
    fetchData();
  }, []);

  if (!mrrData) {
    return <div>Loading...</div>;
  }

  // Assume data is an array of objects with month and value
  const data = mrrData.months || [];

  return (
    <div style={{ backgroundColor: 'white', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h1>Monthly Recurring Revenue</h1>
      <div style={{ display: 'flex', alignItems: 'end' }}>
        {data.map((item: any, index: number) => (
          <div key={index} style={{ margin: '0 10px', textAlign: 'center' }}>
            <div
              style={{
                width: '50px',
                height: `${item.value / 100}px`, // Scale height
                backgroundColor: 'blue',
                transition: 'height 1s ease-in-out',
              }}
            />
            <p>{item.month}</p>
            <p>${item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RemotionRoot;